import { randomInt } from "crypto";

// Cryptographically-secure 6-digit OTP (replaces Math.random()).
export const generateOTP = () => {
  let OTP = "";
  for (let i = 0; i < 6; i++) {
    OTP += randomInt(0, 10).toString();
  }
  return OTP;
};

export function generateUniqueString(length: number = 20): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[randomInt(0, chars.length)];
  }
  return result;
}
