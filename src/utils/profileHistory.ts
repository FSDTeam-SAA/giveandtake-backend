export type HistoryKind = "experience" | "education" | "award";

// Accept saved ISO dates and the month/year and year-only values used by forms.
// Do not let Date.parse interpret an invalid date or a year as a timestamp.
export function historyDate(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  let year: number, month = 1, day = 1;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d{1,2})\/(\d{4})$/))) {
    month = Number(match[1]); year = Number(match[2]);
  } else if ((match = text.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T.*)?)?)?$/))) {
    year = Number(match[1]); month = Number(match[2] || 1); day = Number(match[3] || 1);
  } else return null;
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const timestamp = text.includes("T") ? Date.parse(text) : date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

const ongoingDate = (value: unknown) =>
  typeof value === "string" && /^(present|current|currently|ongoing|now)$/i.test(value.trim());
const missingDate = (value: unknown) => value == null || value === "" ||
  (typeof value === "string" && !value.trim());

function historyKey(value: unknown, kind: HistoryKind): number[] {
  const row = (value || {}) as Record<string, unknown>;
  if (kind === "award") {
    const date = [row.programeDate, row.programDate, row.awardDate, row.date, row.year]
      .map(historyDate).find((date) => date !== null);
    return [date ?? -Infinity, -Infinity];
  }
  const start = historyDate(row.startDate);
  const endValue = kind === "experience" ? row.endDate : row.graduationDate;
  const end = historyDate(endValue);
  const flags = kind === "experience"
    ? [row.currentlyWorking, row.presentlyWorkHere, row.isCurrent]
    : [row.currentlyStudying, row.presentlyAttendHere, row.isCurrent];
  const explicit = flags.find((flag) => typeof flag === "boolean");
  // The API represents ongoing entries with a start date and no end date.
  const current = explicit === true || (explicit !== false &&
    (ongoingDate(endValue) || (start !== null && missingDate(endValue))));
  return [current ? Infinity : end ?? start ?? -Infinity, start ?? -Infinity];
}

export function sortHistory<T = any>(items: readonly T[] | null | undefined, kind: HistoryKind): T[] {
  return (items || []).map((item, index) => ({ item, index, key: historyKey(item, kind) }))
    .sort((a, b) => {
      for (let index = 0; index < a.key.length; index++) {
        if (a.key[index] !== b.key[index]) return a.key[index] > b.key[index] ? -1 : 1;
      }
      return a.index - b.index;
    }).map(({ item }) => item);
}

export function sortExperiences<T = any>(items: readonly T[] | null | undefined): T[] {
  return sortHistory(items, "experience");
}
export function sortEducation<T = any>(items: readonly T[] | null | undefined): T[] {
  return sortHistory(items, "education");
}
export function sortAwards<T = any>(items: readonly T[] | null | undefined): T[] {
  return sortHistory(items, "award");
}
