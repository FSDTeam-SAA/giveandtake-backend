import path from 'path'
import fs from 'fs'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { getVideoMetadata, processVideoHLS } from './ffmpeg.service'
import { validateElevatorPitchAccess } from '../helper/validateElevatorPitchAccess'
import {
  downloadS3ObjectToFile,
  deleteS3Prefix,
  deleteFromS3,
} from './s3.service'

type TranscodeJob = {
  userId: string
  s3Key: string
  fileName?: string
  fileSize?: number
}

const TEMP_ROOT = path.join(process.cwd(), 'temp')
const SOURCE_DIR = path.join(TEMP_ROOT, 'source')
const HLS_DIR = path.join(TEMP_ROOT, 'hls')

const ensureDir = async (dir: string) => {
  await fs.promises.mkdir(dir, { recursive: true })
}

const cleanupPath = async (target: string) => {
  try {
    await fs.promises.rm(target, { recursive: true, force: true })
  } catch (error) {
    console.warn(`Failed to cleanup temp path "${target}":`, error)
  }
}

const cleanupFile = async (target: string) => {
  try {
    await fs.promises.unlink(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to remove file "${target}":`, error)
    }
  }
}

class VideoProcessingQueue {
  private queue: TranscodeJob[] = []
  private processing = false

  enqueue(job: TranscodeJob) {
    this.queue.push(job)
    void this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    const job = this.queue.shift()
    if (!job) return

    this.processing = true
    try {
      await this.handleJob(job)
    } catch (error) {
      console.error('Elevator pitch processing failed:', error)
    } finally {
      this.processing = false
      if (this.queue.length > 0) {
        void this.processNext()
      }
    }
  }

  private async handleJob(job: TranscodeJob): Promise<void> {
    const { userId, s3Key, fileName, fileSize } = job
    const pitch = await ElevatorPitch.findOne({ userId })
    if (!pitch) {
      console.warn(
        `Skipping elevator pitch processing for user "${userId}" – no document`
      )
      return
    }

    const now = new Date()
    pitch.processing = {
      ...(pitch.processing ?? { retries: 0 }),
      state: 'processing',
      startedAt: pitch.processing?.startedAt ?? now,
      updatedAt: now,
      error: null,
      fileSize: fileSize ?? pitch.processing?.fileSize ?? null,
      fileName: fileName ?? pitch.processing?.fileName ?? null,
    }
    await pitch.save()

    await ensureDir(SOURCE_DIR)
    await ensureDir(HLS_DIR)

    const basename = path.basename(s3Key)
    const downloadFolder = path.join(
      SOURCE_DIR,
      userId.toString(),
      `${Date.now()}`
    )
    await ensureDir(downloadFolder)
    const localSource = path.join(downloadFolder, basename)

    try {
      await downloadS3ObjectToFile({ key: s3Key, destinationPath: localSource })

      const metadata = await getVideoMetadata(localSource)
      await validateElevatorPitchAccess(userId.toString(), metadata.duration)

      const workingHlsDir = path.join(
        HLS_DIR,
        userId.toString(),
        `${Date.now()}`
      )
      await ensureDir(workingHlsDir)

      const s3Folder = `elevator_pitches/${userId}/hls/${Date.now()}`

      const { uploadedFiles } = await processVideoHLS(
        localSource,
        workingHlsDir,
        userId.toString(),
        s3Folder
      )

      const hlsUrl = uploadedFiles['master.m3u8'] ?? null
      const encryptionKeyUrl = uploadedFiles['encryption.key'] ?? null

      pitch.video = {
        ...(pitch.video ?? {}),
        hlsUrl,
        encryptionKeyUrl,
        rawKey: s3Key,
        localPaths: {
          original: null,
          hls: null,
          key: null,
        },
      }
      pitch.metadata = {
        duration: metadata.duration,
        format: metadata.format,
        vcodec: metadata.vcodec,
        rotation: metadata.rotation,
        width: metadata.width,
        height: metadata.height,
      }
      pitch.processing = {
        ...(pitch.processing ?? {}),
        state: 'ready',
        updatedAt: new Date(),
        completedAt: new Date(),
        error: null,
      }
      pitch.status = 'active'
      await pitch.save()
    } catch (error) {
      const err = error as Error
      const message = err?.message ?? 'Unknown processing error'
      pitch.processing = {
        ...(pitch.processing ?? {}),
        state: 'failed',
        updatedAt: new Date(),
        error: message,
        retries: (pitch.processing?.retries ?? 0) + 1,
      }
      await pitch.save()
      throw error
    } finally {
      await cleanupFile(localSource)
      await cleanupPath(path.dirname(localSource))
    }
  }
}

const queue = new VideoProcessingQueue()

export const enqueueElevatorPitchTranscode = (job: TranscodeJob) => {
  queue.enqueue(job)
}

export const removeElevatorPitchArtifacts = async ({
  userId,
  rawKey,
}: {
  userId: string
  rawKey?: string | null
}) => {
  const basePrefix = `elevator_pitches/${userId}/hls/`
  await deleteS3Prefix(basePrefix)
  if (rawKey) {
    await deleteFromS3(rawKey)
  }
}
