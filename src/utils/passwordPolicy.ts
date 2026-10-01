export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_REQUIREMENT_MESSAGE =
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an ` +
  "uppercase letter, a lowercase letter, a number and a special character.";

export function isValidPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/.test(password)
  );
}
