import { escapeRegex } from './regex'

export const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : ''

// Match legacy accounts stored with mixed case as well as normalized new accounts.
export const userEmailFilter = (email: unknown) => ({
  email: { $regex: `^${escapeRegex(normalizeEmail(email))}$`, $options: 'i' },
})
