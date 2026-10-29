import { RequestHandler } from 'express'
import AppError from '../errors/AppError'
import { candidateSocialUrlError, hasEducationContent } from '../utils/candidateProfilePolicy'
import { getJobDescriptionText } from '../utils/jobDescriptionPolicy'

type RecordData = Record<string, unknown>

function limit(data: RecordData, key: string, max: number, label: string) {
  const value = data[key]
  if (value === undefined || value === null) return
  if (typeof value !== 'string') throw new AppError(400, `${label} must be text`)
  if (value.length > max) throw new AppError(400, `${label} can be at most ${max} characters`)
}

function object(value: unknown, label: string): RecordData {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { throw new AppError(400, `${label} must contain valid JSON`) }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AppError(400, `${label} must be an object`)
  return parsed as RecordData
}

function entries(value: unknown, label: string): RecordData[] {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { throw new AppError(400, `${label} must contain valid JSON`) }
  }
  if (!Array.isArray(parsed)) throw new AppError(400, `${label} must be a list`)
  return parsed.map(item => object(item, label))
}

export function validateFieldLimits(kind: string, body: RecordData, options: { creating?: boolean } = {}) {
  const data = kind === 'resume' && body.resume !== undefined ? object(body.resume, 'Resume') : body
  for (const [key, max, label] of [
    ['firstName', 20, 'First Name'], ['lastName', 40, 'Last Name'],
    ['sureName', 40, 'Surname'], ['surname', 40, 'Surname'],
  ] as const) limit(data, key, max, label)
  if (kind === 'register' || kind === 'user') {
    // Older apps send only a full name. Do not guess where a multiword first
    // name ends; newer clients additionally send the two explicit parts.
    limit(body, 'name', body.role === 'company' ? 160 : 61, body.role === 'company' ? 'Company Name' : 'Full Name')
  }
  if (kind === 'skill') limit(data, 'name', 100, 'Skill Name')
  if (kind === 'company') limit(data, 'cname', 160, 'Company Name')
  for (const key of ['email', 'emailAddress', 'cemail']) limit(data, key, 254, 'Email')
  if (kind === 'contact') {
    limit(data, 'address', 254, 'Email')
    limit(data, 'subject', 50, 'Subject')
    limit(data, 'message', 500, 'Message')
  }
  if (['resume', 'company', 'recruiter'].includes(kind)) {
    for (const key of ['aboutUs', 'bio']) {
      if (data[key] !== undefined && data[key] !== null) {
        if (typeof data[key] !== 'string') throw new AppError(400, 'About section must be text')
        limit({ text: getJobDescriptionText(data[key] as string) }, 'text', 1400, 'About section')
      }
    }
  }
  for (const [key, max] of Object.entries({ country: 100, city: 100, zip: 20, zipcode: 20, zipCode: 20, industry: 100, department: 100, role: 100, location: 200, phoneNumber: 50, phoneNum: 50, cPhoneNumber: 50, companyWebsite: 200, companyUrl: 200 })) {
    limit(data, key, max, key)
  }
  if (['resume', 'recruiter', 'job'].includes(kind)) limit(data, 'title', 100, 'Job Title')
  if (kind === 'resume' && data.skills !== undefined) {
    if (!Array.isArray(data.skills) || data.skills.some(skill => typeof skill !== 'string' || !skill.trim())) throw new AppError(400, 'Please provide valid skills')
    if (!data.skills.length) throw new AppError(400, 'At least one skill is required')
    if (data.skills.length > 30) throw new AppError(400, 'You can select at most 30 skills')
    for (const skill of data.skills) limit({ skill }, 'skill', 100, 'Each skill')
  }
  if (kind === 'resume') {
    if (options.creating && data.skills === undefined) throw new AppError(400, 'At least one skill is required')
    for (const link of entries(data.sLink ?? [], 'Social links')) {
      if (link.type === 'delete') continue
      const error = candidateSocialUrlError(link.url, typeof link.label === 'string' ? link.label : '')
      if (error) throw new AppError(400, error)
    }
    for (const edu of entries(body.educationList ?? [], 'Education')) {
      if (edu.type === 'delete') continue
      if (!hasEducationContent(edu) && !edu._id) continue
      if (typeof edu.instituteName !== 'string' || !edu.instituteName.trim()) throw new AppError(400, 'Institution name is required')
      limit(edu, 'instituteName', 150, 'Institution name')
      for (const [key, max] of Object.entries({ degree: 100, fieldOfStudy: 100, country: 100, city: 100, startDate: 30, graduationDate: 30 })) limit(edu, key, max, key)
    }
    for (const exp of entries(body.experiences ?? [], 'Experiences')) {
      if (exp.type === 'delete') continue
      limit(exp, 'company', 160, 'Company Name')
      limit(exp, 'position', 100, 'Job Title')
      limit(exp, 'jobTitle', 100, 'Job Title')
      limit(exp, 'jobDescription', 1400, 'Job description')
      for (const [key, max] of Object.entries({ country: 100, city: 100, zip: 20, jobCategory: 100, duration: 50 })) limit(exp, key, max, key)
    }
    for (const award of entries(body.awardsAndHonors ?? [], 'Awards & Honours')) {
      if (award.type === 'delete') continue
      validateFieldLimits('award', award)
    }
    for (const [key, max] of [['certifications', 100], ['languages', 50]] as const) {
      if (data[key] === undefined) continue
      if (!Array.isArray(data[key])) throw new AppError(400, `${key} must be a list`)
      for (const value of data[key] as unknown[]) limit({ value }, 'value', max, key)
    }
  }
  if (kind === 'experience') {
    limit(data, 'position', 100, 'Job Title')
    limit(data, 'company', 160, 'Company Name')
    limit(data, 'jobDescription', 1400, 'Job description')
  }
  if (kind === 'award') {
    limit(data, 'title', 150, 'Award title')
    limit(data, 'programeName', 150, 'Programme name')
    limit(data, 'programName', 150, 'Programme name')
    limit(data, 'description', 500, 'Award short description')
  }
}

// Covers authentication, newsletter and account email forms too. Multipart
// profile fields are checked by fieldLimits after their upload parser.
export const emailFieldLimits: RequestHandler = (req, _res, next) => {
  try {
    for (const key of ['email', 'emailAddress', 'cemail', 'newEmail']) limit(req.body ?? {}, key, 254, 'Email')
    next()
  } catch (error) { next(error) }
}

// Validate only incoming fields. No schema migration or validation of untouched
// legacy documents is needed, and invalid requests never reach media/DB writes.
export const fieldLimits = (kind: string, options: { creating?: boolean } = {}): RequestHandler => (req, _res, next) => {
  try { validateFieldLimits(kind, { ...(req.body ?? {}), ...(kind === "user" ? { role: req.user?.role } : {}) }, options); next() } catch (error) { next(error) }
}
