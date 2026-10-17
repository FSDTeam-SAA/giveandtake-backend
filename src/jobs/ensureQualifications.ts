import { Qualification } from "../models/qualification.model";
import { qualificationDefaults, qualificationKey } from "../utils/qualificationDefaults";

export async function ensureQualifications() {
  // Insert missing defaults only; never overwrite an administrator's edits.
  await Qualification.bulkWrite(qualificationDefaults.map(([value, label], order) => ({
    updateOne: {
      filter: { value },
      update: { $setOnInsert: { value, label, key: qualificationKey(label), active: true, order } },
      upsert: true,
    },
  })));
}
