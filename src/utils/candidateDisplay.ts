// Standalone legacy salutations only; never strip text from a person's name.
export const CANDIDATE_SALUTATION_SOURCE = "^\\s*(?:mr|mrs|ms|miss|mx|mister|dr|doctor|prof|professor|sir|dame|rev|reverend|madam)\\.?\\s*$";
export function candidateHeadline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && !new RegExp(CANDIDATE_SALUTATION_SOURCE, "i").test(text) ? text : null;
}
export function candidateName(firstName?: string | null, lastName?: string | null): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
}
