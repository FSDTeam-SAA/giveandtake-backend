export const JOB_DESCRIPTION_MIN_WORDS = 20;
export const JOB_DESCRIPTION_MAX_CHARACTERS = 2000;

export function getJobDescriptionText(value: string): string {
  const entities: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  };
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|br|blockquote)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function getJobDescriptionCounts(value: string) {
  const text = getJobDescriptionText(value);
  return { characters: text.length, words: text ? text.split(/\s+/).length : 0 };
}

export function getJobDescriptionError(value: unknown): string | null {
  if (typeof value !== "string") return "Description is required";
  const { characters, words } = getJobDescriptionCounts(value);
  if (!characters) return "Description is required";
  if (words < JOB_DESCRIPTION_MIN_WORDS) {
    return `Job description must have at least ${JOB_DESCRIPTION_MIN_WORDS} words`;
  }
  if (characters > JOB_DESCRIPTION_MAX_CHARACTERS) {
    return `Job description must not exceed ${JOB_DESCRIPTION_MAX_CHARACTERS} characters`;
  }
  return null;
}
