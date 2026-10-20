import { RequestHandler } from 'express'
import AppError from '../errors/AppError'

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

export function validateFieldLimits(kind: string, body: RecordData) {
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
  if (['resume', 'recruiter', 'job'].includes(kind)) limit(data, 'title', 100, 'Job Title')
  if (kind === 'resume' && data.skills !== undefined) {
    if (!Array.isArray(data.skills) || data.skills.some(skill => typeof skill !== 'string' || !skill.trim())) throw new AppError(400, 'Please select valid skills from the list')
    if (data.skills.length > 30) throw new AppError(400, 'You can select at most 30 skills')
    for (const skill of data.skills) limit({ skill }, 'skill', 100, 'Each skill')
  }
  if (kind === 'resume') {
    for (const exp of entries(body.experiences ?? [], 'Experiences')) {
      if (exp.type === 'delete') continue
      limit(exp, 'company', 160, 'Company Name')
      limit(exp, 'position', 100, 'Job Title')
      limit(exp, 'jobTitle', 100, 'Job Title')
    }
  }
}

// Validate only incoming fields. No schema migration or validation of untouched
// legacy documents is needed, and invalid requests never reach media/DB writes.
export const fieldLimits = (kind: string): RequestHandler => (req, _res, next) => {
  try { validateFieldLimits(kind, { ...(req.body ?? {}), ...(kind === "user" ? { role: req.user?.role } : {}) }); next() } catch (error) { next(error) }
}
