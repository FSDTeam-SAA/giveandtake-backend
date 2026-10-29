import { createHash } from 'crypto';
import AppError from '../errors/AppError';
export const skillText = (value: string) => value.trim().replace(/\s+/g, ' ');
export const skillKey = (value: string) => createHash('sha256').update(skillText(value).toLowerCase()).digest('hex');
export function validSkillName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new AppError(400, 'Skill name must contain 1 to 100 characters');
  return skillText(value);
}
export function skillMatch(value: string) {
  return new RegExp('^\\s*' + skillText(value).split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+') + '\\s*$', 'i');
}
export interface SkillSubmission { key: string; name: string; count: number; status: string; }
export function groupSkills(profiles: { skills?: unknown }[]): SkillSubmission[] {
  const groups = new Map<string, SkillSubmission>();
  for (const profile of profiles) {
    const seen = new Set<string>();
    for (const value of Array.isArray(profile.skills) ? profile.skills : []) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const name = skillText(value), key = skillKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { key, name, count: 1, status: 'pending' });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function skillSuggestions<T extends { name?: string; active?: boolean }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (row.active === false || typeof row.name !== 'string' || !row.name.trim()) return false;
    const key = skillKey(row.name);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
