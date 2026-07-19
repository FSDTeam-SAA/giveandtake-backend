/**
 * One-off migration for the search overhaul.
 *
 * Drops the old JobTextIndex (MongoDB allows only one text index per
 * collection, so the redefined index cannot build while the old one exists),
 * then builds every index declared on the search-related schemas.
 *
 * Deliberately does NOT use Model.syncIndexes(): that would drop indexes not
 * declared in the schemas — including Atlas-managed ones such as the chatbot
 * vector-search index.
 *
 * Run with: npm run sync-indexes
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { Job } from "../models/job.model";
import { User } from "../models/user.model";
import { CreateResume } from "../models/createResume.model";
import { RecruiterAccount } from "../models/recruiterAccount.model";
import { Company } from "../models/company.model";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set");
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  try {
    await Job.collection.dropIndex("JobTextIndex");
    console.log("Dropped old JobTextIndex");
  } catch (error: any) {
    if (error?.codeName === "IndexNotFound" || error?.code === 27) {
      console.log("JobTextIndex not present — nothing to drop");
    } else {
      throw error;
    }
  }

  await Promise.all([
    Job.createIndexes(),
    User.createIndexes(),
    CreateResume.createIndexes(),
    RecruiterAccount.createIndexes(),
    Company.createIndexes(),
  ]);
  console.log("All declared indexes created");

  const jobIndexes = await Job.collection.indexes();
  console.log("jobs indexes:", JSON.stringify(jobIndexes, null, 2));

  await mongoose.disconnect();
  console.log("Done");
}

main().catch((error) => {
  console.error("sync-search-indexes failed:", error);
  process.exit(1);
});
