/**
 * Shared helpers for safely turning user-supplied text into MongoDB queries.
 */

// Escape characters that have special meaning in a regular expression.
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize an arbitrary query value (string | string[] | undefined) into a
// trimmed, length-capped string. Never trust client-side maxLength.
export function capQuery(s: unknown, max = 200): string {
  const text = Array.isArray(s) ? s.join(" ") : typeof s === "string" ? s : "";
  return text.trim().slice(0, max);
}

// Word-start match for typeahead suggestions: "dev" matches "Developer" and
// "Senior Developer" but not "Sandeviate".
export function wordStartRegex(q: string): RegExp {
  return new RegExp("(^|[\\s\\-/(,])" + escapeRegex(q), "i");
}
