import jwt from 'jsonwebtoken'

// Why this exists:
// Native mobile video players (iOS AVPlayer, Android ExoPlayer) attach the
// Authorization header ONLY to the first request of an HLS stream (the master
// playlist). They do NOT send it on the follow-up requests for the nested
// playlist, the AES key, or the .ts segments — so those protected sub-files
// 404 on mobile (the browser works only because HLS.js re-sends the header
// every time).
//
// The fix: once the user is authorised on the master playlist, we mint a small,
// short-lived "media token" and bake it into every sub-file URL as `?t=...`.
// Players DO carry query strings on follow-up requests, so the sub-files can be
// authorised by this token instead of a header. The token is scoped to a single
// pitch owner and expires quickly, so it can't be reused for anything else.

const SECRET = process.env.JWT_ACCESS_SECRET as string

// Valid for 6h — far longer than any pitch playback, far shorter than the
// account access token, so a leaked media token is low-value and self-expiring.
export const signMediaToken = (ownerUserId: string): string =>
  jwt.sign({ uid: ownerUserId, scope: 'media' }, SECRET, { expiresIn: '6h' })

export const isValidMediaToken = (
  token: unknown,
  ownerUserId: string
): boolean => {
  if (typeof token !== 'string' || !token) return false
  try {
    const payload = jwt.verify(token, SECRET) as { uid?: string; scope?: string }
    return payload.scope === 'media' && payload.uid === ownerUserId
  } catch {
    return false
  }
}
