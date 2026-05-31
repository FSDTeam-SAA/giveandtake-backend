import rateLimit from "express-rate-limit";

const tooMany = (message: string) => ({ success: false, message });

/**
 * Strict limiter for authentication endpoints (login, register, refresh).
 * Blunts credential stuffing and account enumeration.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany("Too many attempts. Please try again in a few minutes."),
});

/**
 * Very strict limiter for OTP / password-reset flows (forget, reset,
 * verify-otp, resend, security-answer reset). Blunts OTP brute force and
 * email bombing.
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany("Too many attempts. Please try again in a few minutes."),
});

/**
 * Limiter for public LLM / chatbot endpoints to bound model spend and DoS.
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany("Too many requests. Please slow down."),
});
