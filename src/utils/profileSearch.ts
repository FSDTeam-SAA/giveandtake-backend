import { htmlToText } from 'html-to-text';
import { Schema } from 'mongoose';

export function profileAboutText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return htmlToText(value, {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' }, { selector: 'style', format: 'skip' },
      { selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } },
    ],
  }).replace(/\s+/g, ' ').trim();
}

// All existing and older-client write paths use these model operations.
// Clients cannot supply the derived field, and unrelated edits do not reset it.
export function installAboutSearch(schema: Schema, source: 'aboutUs' | 'bio') {
  schema.add({ searchAboutText: { type: String, select: false } });
  schema.pre('save', function () {
    if (this.isNew || this.isModified(source) || this.isModified('searchAboutText'))
      this.set('searchAboutText', profileAboutText(this.get(source)));
  });
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
    const update = this.getUpdate() as Record<string, any> | null;
    if (!update || Array.isArray(update)) return;
    delete update.searchAboutText;
    for (const [operator, values] of Object.entries(update)) {
      if (!operator.startsWith('$') || !values || typeof values !== 'object') continue;
      for (const key of Object.keys(values)) {
        if (key === 'searchAboutText' || key.startsWith('searchAboutText.') ||
          (operator === '$rename' && (values[key] === 'searchAboutText' || String(values[key]).startsWith('searchAboutText.')))) delete values[key];
      }
    }
    if (Object.prototype.hasOwnProperty.call(update, source)) update.searchAboutText = profileAboutText(update[source]);
    else if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, source)) update.$set.searchAboutText = profileAboutText(update.$set[source]);
    else if (update.$unset && Object.prototype.hasOwnProperty.call(update.$unset, source)) (update.$set ??= {}).searchAboutText = '';
    else if (update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, source)) update.$setOnInsert.searchAboutText = profileAboutText(update.$setOnInsert[source]);
  });
}
