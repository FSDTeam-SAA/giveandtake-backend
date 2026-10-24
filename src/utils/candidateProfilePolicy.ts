export const CANDIDATE_URL_LIMIT = 160

const platformHosts: Record<string, string[]> = {
  linkedin: ['linkedin.com'], twitter: ['twitter.com', 'x.com'], x: ['twitter.com', 'x.com'],
  facebook: ['facebook.com', 'fb.com'], tiktok: ['tiktok.com'], instagram: ['instagram.com'],
  upwork: ['upwork.com'], fiverr: ['fiverr.com'],
}

export function candidateSocialUrlError(value: unknown, platform: string): string | undefined {
  if (value === undefined || value === null || value === '') return
  if (typeof value !== 'string') return 'URL must be text'
  const text = value.trim()
  if (!text || /\s/.test(text)) return 'Please enter a valid HTTP or HTTPS URL'
  if (text.length > CANDIDATE_URL_LIMIT) return `URL can be at most ${CANDIDATE_URL_LIMIT} characters`
  let url: URL
  try { url = new URL(text) } catch { return 'Please enter a valid HTTP or HTTPS URL' }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return 'Please enter a valid HTTP or HTTPS URL'
  const hosts = platformHosts[platform.trim().toLowerCase().replace(/\s+url$/, '')]
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (hosts && !hosts.some(domain => host === domain || host.endsWith(`.${domain}`))) return `Please enter a valid ${platform} URL`
}

export function hasEducationContent(education: Record<string, unknown>): boolean {
  return ['instituteName', 'institution', 'university', 'degree', 'fieldOfStudy', 'country', 'city', 'startDate', 'graduationDate']
    .some(key => typeof education[key] === 'string' && (education[key] as string).trim().length > 0)
    || education.currentlyStudying === true || education.presentlyAttendHere === true
}
