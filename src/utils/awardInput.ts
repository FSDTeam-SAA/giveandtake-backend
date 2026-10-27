// Accept the spellings used by older web/mobile forms while keeping the
// existing persisted field and response contract. Omitted fields stay omitted.
export function normalizeAwardInput<T extends Record<string, unknown>>(award: T): T & { programeName?: unknown } {
  if (award.programeName !== undefined) return { ...award };
  const name = award.programName ?? award.issuer;
  return name === undefined ? { ...award } : { ...award, programeName: name };
}
