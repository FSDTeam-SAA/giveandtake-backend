import fs from 'fs'
import path from 'path'
import mongoose, { Types } from 'mongoose'
import { AppliedJob } from '../models/appliedJob.model'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import { Blog } from '../models/Blog.model'
import { Bookmark } from '../models/bookmark.model'
import ChatbotHistory from '../models/ChatbotHistory.model'
import { Company } from '../models/company.model'
import { CreateResume } from '../models/createResume.model'
import { Education } from '../models/education.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { Experience } from '../models/experience.model'
import { Following } from '../models/following.model'
import { Job } from '../models/job.model'
import { Message } from '../models/message.model'
import { MessageRoom } from '../models/messageRoom.model'
import { Newsletter } from '../models/newsletter.model'
import { Notification } from '../models/notification.model'
import { paymentInfo } from '../models/paymentInfo.model'
import { Recruiter } from '../models/recruiter.model'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import { ReqCompany } from '../models/assignCompanyReq.model'
import { Resume } from '../models/resume.model'
import { User } from '../models/user.model'
import {
  deletePublicFile,
  extractPublicKey,
} from './r2Public.service'
import { deleteFromS3, extractR2Key } from './s3.service'
import { removeElevatorPitchArtifacts } from './videoProcessing.queue'
import { deleteCloudinaryAssetFromUrl } from '../utils/cloudinary'

type StoredPublicAsset = {
  key?: string | null
  url?: string | null
}

export type UserDeletionSummary = {
  userId: string
  jobs: number
  applications: number
  resumes: number
  messages: number
  publicAssets: number
  privateAssets: number
  cloudinaryAssets: number
}

type UserDeletionOptions = {
  scheduledCutoff?: Date
}

const isCloudinaryUrl = (value?: string | null) => {
  if (!value) return false
  try {
    return new URL(value).hostname.toLowerCase().endsWith('cloudinary.com')
  } catch {
    return false
  }
}

const isManagedPublicR2Url = (value?: string | null) => {
  if (!value) return false
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname.endsWith('.r2.dev') ||
      hostname.endsWith('.r2.cloudflarestorage.com')
    ) {
      return true
    }

    const configuredBase = process.env.R2_PUBLIC_BASE
    return configuredBase
      ? parsed.origin === new URL(configuredBase).origin
      : false
  } catch {
    return false
  }
}

const addPublicAsset = (
  asset: StoredPublicAsset,
  publicKeys: Set<string>,
  cloudinaryUrls: Set<string>
) => {
  if (asset.key) publicKeys.add(asset.key)
  if (!asset.url) return
  if (isCloudinaryUrl(asset.url)) {
    cloudinaryUrls.add(asset.url)
  } else if (!asset.key && isManagedPublicR2Url(asset.url)) {
    const key = extractPublicKey(asset.url)
    if (key) publicKeys.add(key)
  }
}

const addPrivateAsset = (
  key: string | null | undefined,
  url: string | null | undefined,
  privateKeys: Set<string>
) => {
  const resolved = key || extractR2Key(url)
  if (resolved) privateKeys.add(resolved)
}

const addSafeLocalResumePaths = (
  filename: string | undefined,
  url: string | undefined,
  localPaths: Set<string>
) => {
  if (filename) {
    const safeName = path.basename(filename)
    localPaths.add(path.resolve(process.cwd(), 'uploads', safeName))
    localPaths.add(path.resolve(process.cwd(), 'uploads', 'resumes', safeName))
  }

  if (url && !/^https?:\/\//i.test(url)) {
    const relative = url.replace(/^\/+/, '')
    localPaths.add(path.resolve(process.cwd(), relative))
  }
}

const deleteSafeLocalFile = async (target: string) => {
  const resolved = path.resolve(target)
  const allowedRoot = path.resolve(process.cwd(), 'uploads')
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) return

  try {
    await fs.promises.unlink(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export const deleteUserAndRelatedData = async (
  userId: string,
  options: UserDeletionOptions = {}
): Promise<UserDeletionSummary | null> => {
  if (!Types.ObjectId.isValid(userId)) return null
  const objectId = new Types.ObjectId(userId)

  // Atomically claim the account before reading any related records. For a
  // scheduled purge, the date/deactivation predicates also prevent deleting a
  // user who reactivated after the scheduler selected its initial batch.
  const user = await User.findOneAndUpdate(
    {
      _id: objectId,
      ...(options.scheduledCutoff
        ? {
            deactivate: true,
            dateOfdeactivate: { $lte: options.scheduledCutoff },
          }
        : {}),
    },
    { $set: { deactivate: true, deletionInProgress: true } },
    { new: true }
  )
  if (!user) return null

  const [candidateProfiles, recruiterProfiles, companies, resumes, pitches] =
    await Promise.all([
      CreateResume.find({ userId: objectId }).lean(),
      RecruiterAccount.find({ userId: objectId }).lean(),
      Company.find({ userId: objectId }).lean(),
      Resume.find({ userId: objectId }).lean(),
      ElevatorPitch.find({ userId: objectId }).lean(),
    ])

  const recruiterProfileIds = recruiterProfiles.map((profile) => profile._id)
  const companyIds = companies.map((company) => company._id)

  const companyRequestConditions: Record<string, unknown>[] = [
    { userId: objectId },
  ]
  if (companyIds.length) {
    companyRequestConditions.push({ company: { $in: companyIds } })
  }
  const companyRequests = await ReqCompany.find({
    $or: companyRequestConditions,
  })
    .select('_id')
    .lean()
  const companyRequestIds = companyRequests.map((request) => request._id)

  const jobOwnerConditions: Record<string, unknown>[] = [{ userId: objectId }]
  if (companyIds.length) jobOwnerConditions.push({ companyId: { $in: companyIds } })
  if (recruiterProfileIds.length) {
    jobOwnerConditions.push({ recruiterId: { $in: recruiterProfileIds } })
  }

  const jobs = await Job.find({ $or: jobOwnerConditions }).select('_id').lean()
  const jobIds = jobs.map((job) => job._id)

  const applicationConditions: Record<string, unknown>[] = [{ userId: objectId }]
  if (jobIds.length) applicationConditions.push({ jobId: { $in: jobIds } })
  const applications = await AppliedJob.find({
    $or: applicationConditions,
  }).lean()
  const applicationIds = applications.map((application) => application._id)

  const roomConditions = [
    { userId: objectId },
    { recruiterId: objectId },
    { companyId: objectId },
  ]
  const [memberRooms, authoredMessages] = await Promise.all([
    MessageRoom.find({ $or: roomConditions }).select('_id').lean(),
    Message.find({ userId: objectId }).lean(),
  ])
  const roomIdStrings = new Set<string>([
    ...memberRooms.map((room) => String(room._id)),
    ...authoredMessages.map((message) => String(message.roomId)),
  ])
  const roomIds = Array.from(roomIdStrings).map((id) => new Types.ObjectId(id))

  const publicKeys = new Set<string>()
  const privateKeys = new Set<string>()
  const cloudinaryUrls = new Set<string>()
  const localPaths = new Set<string>()

  addPublicAsset(user.avatar ?? {}, publicKeys, cloudinaryUrls)
  for (const profile of candidateProfiles) {
    addPublicAsset(
      { key: profile.photoKey, url: profile.photo },
      publicKeys,
      cloudinaryUrls
    )
    addPublicAsset(
      { key: profile.bannerKey, url: profile.banner },
      publicKeys,
      cloudinaryUrls
    )
  }
  for (const profile of recruiterProfiles) {
    addPublicAsset(
      { key: profile.photoKey, url: profile.photo },
      publicKeys,
      cloudinaryUrls
    )
    addPublicAsset(
      { key: profile.bannerKey, url: profile.banner },
      publicKeys,
      cloudinaryUrls
    )
    addPublicAsset(
      { key: profile.videoFileKey, url: profile.videoFile },
      publicKeys,
      cloudinaryUrls
    )
  }
  for (const company of companies) {
    addPublicAsset(
      { key: company.clogoKey, url: company.clogo },
      publicKeys,
      cloudinaryUrls
    )
    addPublicAsset(
      { key: company.bannerKey, url: company.banner },
      publicKeys,
      cloudinaryUrls
    )
  }
  for (const message of authoredMessages) {
    for (const file of message.file ?? []) {
      addPublicAsset(file, publicKeys, cloudinaryUrls)
    }
  }
  for (const resume of resumes) {
    for (const file of resume.file ?? []) {
      addPrivateAsset(file.key, file.url, privateKeys)
      addSafeLocalResumePaths(file.filename, file.url, localPaths)
    }
  }

  // Delete assets while their database references are still available. Every
  // operation is idempotent, so a failed run can safely be retried.
  for (const pitch of pitches) {
    await removeElevatorPitchArtifacts({
      userId,
      rawKey: pitch.video?.rawKey ?? pitch.video?.url ?? undefined,
    })
  }
  await Promise.all(Array.from(privateKeys, (key) => deleteFromS3(key)))
  await Promise.all(Array.from(publicKeys, (key) => deletePublicFile(key)))
  await Promise.all(
    Array.from(cloudinaryUrls, (url) => deleteCloudinaryAssetFromUrl(url))
  )
  for (const localPath of localPaths) await deleteSafeLocalFile(localPath)

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const deletedJobIds = new Set(jobIds.map(String))
      const applicationCounts = new Map<string, number>()
      for (const application of applications) {
        const jobId = String(application.jobId)
        if (deletedJobIds.has(jobId)) continue
        applicationCounts.set(jobId, (applicationCounts.get(jobId) ?? 0) + 1)
      }
      for (const [jobId, count] of applicationCounts) {
        await Job.updateOne(
          { _id: jobId },
          { $inc: { counter: -count } },
          { session }
        )
      }

      if (applicationIds.length) {
        await AppliedJob.deleteMany(
          { _id: { $in: applicationIds } },
          { session }
        )
      }
      if (jobIds.length) {
        await Bookmark.deleteMany(
          { $or: [{ userId: objectId }, { jobId: { $in: jobIds } }] },
          { session }
        )
        await Job.deleteMany({ _id: { $in: jobIds } }, { session })
        await paymentInfo.updateMany(
          { consumedForJobId: { $in: jobIds } },
          { $unset: { consumedForJobId: '' } },
          { session }
        )
      } else {
        await Bookmark.deleteMany({ userId: objectId }, { session })
      }

      const notificationReferenceIds = [
        ...jobIds,
        ...applicationIds,
        ...pitches.map((pitch) => pitch._id),
        ...recruiterProfileIds,
        ...companyIds,
        ...companyRequestIds,
      ]
      await Notification.deleteMany(
        {
          $or: [
            { to: objectId },
            ...(notificationReferenceIds.length
              ? [{ id: { $in: notificationReferenceIds } }]
              : []),
          ],
        },
        { session }
      )

      await Following.deleteMany(
        {
          $or: [
            { userId: objectId },
            { recruiterId: objectId },
            { companyId: objectId },
            ...(recruiterProfileIds.length
              ? [{ recruiterId: { $in: recruiterProfileIds } }]
              : []),
            ...(companyIds.length ? [{ companyId: { $in: companyIds } }] : []),
          ],
        },
        { session }
      )

      if (companyRequestIds.length) {
        await ReqCompany.deleteMany(
          { _id: { $in: companyRequestIds } },
          { session }
        )
      }
      await Company.updateMany(
        { employeesId: objectId },
        { $pull: { employeesId: objectId } },
        { session }
      )
      if (companyIds.length) {
        await RecruiterAccount.updateMany(
          { companyId: { $in: companyIds }, userId: { $ne: objectId } },
          { $unset: { companyId: '' } },
          { session }
        )
      }

      if (authoredMessages.length) {
        await Message.deleteMany({ userId: objectId }, { session })
      }
      await Message.updateMany(
        { readBy: objectId },
        { $pull: { readBy: objectId } },
        { session }
      )
      await MessageRoom.updateMany(
        { userId: objectId },
        { $unset: { userId: '' } },
        { session }
      )
      await MessageRoom.updateMany(
        { recruiterId: objectId },
        { $unset: { recruiterId: '' } },
        { session }
      )
      await MessageRoom.updateMany(
        { companyId: objectId },
        { $unset: { companyId: '' } },
        { session }
      )

      for (const roomId of roomIds) {
        const room = await MessageRoom.findById(roomId).session(session).lean()
        if (!room) continue
        if (!room.userId && !room.recruiterId && !room.companyId) {
          await Message.deleteMany({ roomId }, { session })
          await MessageRoom.deleteOne({ _id: roomId }, { session })
          continue
        }

        const latestMessage = await Message.findOne({ roomId })
          .sort({ createdAt: -1 })
          .session(session)
          .lean()
        await MessageRoom.updateOne(
          { _id: roomId },
          {
            $set: {
              lastMessage:
                latestMessage?.message ||
                (latestMessage?.file?.length ? 'Attachment' : ''),
              lastMessageSender: latestMessage?.userId ?? null,
            },
          },
          { session }
        )
      }

      // MongoDB transactions must not run operations in parallel on one
      // session, so keep this sequence explicit.
      await CreateResume.deleteMany({ userId: objectId }, { session })
      await Experience.deleteMany({ userId: objectId }, { session })
      await Education.deleteMany({ userId: objectId }, { session })
      await AwardsAndHonor.deleteMany({ userId: objectId }, { session })
      await ElevatorPitch.deleteMany({ userId: objectId }, { session })
      await Resume.deleteMany({ userId: objectId }, { session })
      await RecruiterAccount.deleteMany({ userId: objectId }, { session })
      await Company.deleteMany({ userId: objectId }, { session })
      await Recruiter.deleteMany({ userId: objectId }, { session })
      await ChatbotHistory.deleteMany({ userId: objectId }, { session })
      await Newsletter.deleteMany({ email: user.email }, { session })

      // Financial records are retained for audit/refund history and marked
      // rather than destroyed.
      await paymentInfo.updateMany(
        { userId: objectId },
        { $set: { userDeletedAt: new Date() } },
        { session }
      )

      // Public editorial content survives staff deletion without retaining a
      // dangling user reference or personal author attribution.
      await Blog.updateMany(
        { userId: objectId },
        {
          $unset: { userId: '' },
          $set: { authorName: 'EVPitch Team', authorDeleted: true },
        },
        { session }
      )

      await User.deleteOne({ _id: objectId }, { session })
    })
  } finally {
    await session.endSession()
  }

  return {
    userId,
    jobs: jobs.length,
    applications: applications.length,
    resumes: resumes.length,
    messages: authoredMessages.length,
    publicAssets: publicKeys.size,
    privateAssets: privateKeys.size + pitches.length,
    cloudinaryAssets: cloudinaryUrls.size,
  }
}
