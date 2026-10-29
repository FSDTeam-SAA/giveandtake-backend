/** Dry run by default. --apply updates derived text only; never original data/timestamps. */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { profileAboutText } from '../utils/profileSearch';

export async function backfillProfileSearch(db: any, apply = false) {
  const report = [];
  for (const [name, source] of [['createresumes', 'aboutUs'], ['companies', 'aboutUs'], ['recruiteraccounts', 'bio']]) {
    const collection = db.collection(name);
    let scanned = 0, pending = 0, updated = 0, conflicts = 0;
    for await (const row of collection.find({}, { projection: { [source]: 1, searchAboutText: 1 } })) {
      scanned++;
      const text = profileAboutText(row[source]);
      if (row.searchAboutText === text) continue;
      pending++;
      if (apply) {
        const result = await collection.updateOne({ _id: row._id,
          [source]: Object.prototype.hasOwnProperty.call(row, source) ? { $eq: row[source] } : { $exists: false },
          searchAboutText: Object.prototype.hasOwnProperty.call(row, 'searchAboutText') ? { $eq: row.searchAboutText } : { $exists: false },
        }, { $set: { searchAboutText: text } });
        if (result.matchedCount) updated++; else conflicts++;
      }
    }
    report.push({ collection: name, scanned, pending, updated, conflicts });
  }
  return report;
}
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Only --apply is supported; default is dry run');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  try { console.log(JSON.stringify({ apply: process.argv.includes('--apply'), results: await backfillProfileSearch(mongoose.connection.db, process.argv.includes('--apply')) })); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
