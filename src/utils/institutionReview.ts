import { createHash } from 'crypto';

export const institutionText = (value: string) => value.trim().replace(/\s+/g, ' ');
export const institutionKey = (name: string, country = '') => createHash('sha256')
  .update(JSON.stringify([institutionText(name).toLowerCase(), institutionText(country).toLowerCase()]))
  .digest('hex');

export interface InstitutionSubmission {
  key: string;
  name: string;
  country: string;
  count: number;
  status: 'pending' | 'approved' | 'rejected';
}

// Review is derived from saved education, including historical profiles. No writes
// or moderation dependency are added to the candidate's save request.
export function groupInstitutions(rows: { instituteName?: string; country?: string }[]): InstitutionSubmission[] {
  const groups = new Map<string, InstitutionSubmission>();
  for (const row of rows) {
    if (typeof row.instituteName !== 'string' || !row.instituteName.trim()) continue;
    const name = institutionText(row.instituteName);
    const country = typeof row.country === 'string' ? institutionText(row.country) : '';
    const key = institutionKey(name, country);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, name, country, count: 1, status: 'pending' });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.country.localeCompare(b.country));
}

export function catalogInstitutionMatcher(catalog: { name: string; country: string }[]) {
  const keys = new Set(catalog.map(item => institutionKey(item.name, item.country)));
  const names = new Set(catalog.map(item => institutionText(item.name).toLowerCase()));
  return (row: { name: string; country: string }) => row.country
    ? keys.has(institutionKey(row.name, row.country))
    : names.has(institutionText(row.name).toLowerCase());
}

// Match legacy records too, without rewriting their stored name/country.
export function institutionMatch(value: string) {
  const escaped = institutionText(value).split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return new RegExp(`^\\s*${escaped}\\s*$`, 'i');
}
