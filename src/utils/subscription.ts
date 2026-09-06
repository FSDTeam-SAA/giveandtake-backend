import { IPaymentInfo } from "../interface/paymentInfo.interface";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const addMonths = (date: Date, months: number) => {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

const addYears = (date: Date, years: number) => {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
};

const normalizeDuration = (value?: string | null) => {
  const normalized = (value ?? "").toString().toLowerCase();
  if (normalized === "payasyougo") return "payg";
  return normalized;
};

export const computeExpiryFromStart = (
  start: Date,
  durationRaw: string
): Date | null => {
  const duration = normalizeDuration(durationRaw);
  if (duration === "monthly") return addMonths(start, 1);
  if (duration === "yearly") return addYears(start, 1);
  if (duration === "payg") return new Date(start.getTime() + 30 * MILLIS_PER_DAY);
  return null;
};

export const resolvePaymentExpiry = (
  payment: Partial<IPaymentInfo>
): Date | null => {
  if (payment.duration === 'credits') return null;
  if (payment.expiresAt) {
    return new Date(payment.expiresAt);
  }

  const basis = payment.updatedAt ?? payment.createdAt;
  if (!basis) return null;

  const durationSource =
    payment.duration ??
    (payment as any)?.planId?.valid ??
    (payment as any)?.plan?.valid;

  const expiry = computeExpiryFromStart(
    new Date(basis),
    normalizeDuration(durationSource)
  );
  return expiry;
};

export const isPaymentExpired = (
  payment: Partial<IPaymentInfo>,
  reference: Date = new Date()
): boolean => {
  const expiry = resolvePaymentExpiry(payment);
  if (!expiry) return false;
  const ref = new Date(reference);
  return ref > expiry;
};
