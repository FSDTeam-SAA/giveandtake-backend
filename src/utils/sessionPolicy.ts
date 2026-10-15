// Absolute session limits. Refreshing an access token never extends these.
export const SESSION_SECONDS = 12 * 60 * 60;
export const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const ACCESS_TOKEN_SECONDS = 15 * 60;

export const sessionDeadline = (rememberMe: unknown, now = Date.now()) =>
  Math.floor(now / 1000) +
  (rememberMe === true || rememberMe === 'true'
    ? REMEMBERED_SESSION_SECONDS
    : SESSION_SECONDS);

export const remainingSessionSeconds = (deadline: number, now = Date.now()) =>
  Math.max(0, Math.floor(deadline - now / 1000));
