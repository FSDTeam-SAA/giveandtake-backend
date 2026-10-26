// utils/universityFileParser.ts
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import csvParser from "csv-parser";


export async function parseUniversityFile(
  filePath: string
): Promise<{ country: string; name: string }[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return new Promise((resolve, reject) => {
      const rows: { country: string; name: string }[] = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on("data", (row) => {
          let country = "";
          let name = "";

          if (row.Country !== undefined && row.University !== undefined) {
            country = String(row.Country).trim();
            name = String(row.University).trim();
          } else if (row.country !== undefined && row.name !== undefined) {
            country = String(row.country).trim();
            name = String(row.name).trim();
          } else {
            const vals = Object.values(row);
            if (vals.length >= 2) {
              country = String(vals[0]).trim();
              name = String(vals[1]).trim();
            }
          }

          if (country && name) {
            rows.push({ country, name });
          }
        })
        .on("end", () => resolve(rows))
        .on("error", (err) => reject(err));
    });
  } else if (ext === ".xls" || ext === ".xlsx") {
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 0 });

    const rows: { country: string; name: string }[] = [];

    for (const obj of data as any[]) {
      let country = "";
      let name = "";

      if (obj["Country"] !== undefined && obj["University"] !== undefined) {
        country = String(obj["Country"]).trim();
        name = String(obj["University"]).trim();
      } else if (obj["country"] !== undefined && obj["name"] !== undefined) {
        country = String(obj["country"]).trim();
        name = String(obj["name"]).trim();
      } else {
        continue;
      }

      if (country && name) {
        rows.push({ country, name });
      }
    }

    return rows;
  } else {
    throw new Error("Unsupported file type");
  }
}


import { isValidObjectId } from "mongoose";
import { University } from "../models/university.model";
import { Education } from "../models/education.model";
import { InstitutionReview } from "../models/institutionReview.model";
import catchAsync from "../utils/catchAsync";
import AppError from "../errors/AppError";
import { groupInstitutions, institutionKey, institutionText, institutionMatch, catalogInstitutionMatcher } from "../utils/institutionReview";

function validId(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid institution ID");
}
function fields(body: Record<string, unknown>) {
  const { name, country, active } = body || {};
  if (typeof name !== "string" || !name.trim() || institutionText(name).length > 150)
    throw new AppError(400, "Institution name must contain 1 to 150 characters");
  if (typeof country !== "string" || !country.trim() || institutionText(country).length > 100)
    throw new AppError(400, "Country must contain 1 to 100 characters");
  if (active !== undefined && typeof active !== "boolean") throw new AppError(400, "Active must be true or false");
  return { name: institutionText(name), country: institutionText(country), normalizedKey: institutionKey(name, country),
    ...(active === undefined ? {} : { active }) };
}
async function existingInstitution(name: string, country: string) {
  return University.findOne({ name: institutionMatch(name), country: institutionMatch(country) });
}
async function saveNew(body: Record<string, unknown>, reuse = false) {
  const values = fields(body);
  const existing = await existingInstitution(values.name, values.country);
  if (existing) {
    if (!reuse) throw new AppError(409, "Institution already exists. Edit the existing entry instead.");
    existing.active = true;
    await existing.save();
    return existing;
  }
  try { return await University.create(values); }
  catch (error: any) {
    if (error.code !== 11000) throw error;
    if (reuse) {
      const duplicate = await existingInstitution(values.name, values.country);
      if (duplicate) { duplicate.active = true; await duplicate.save(); return duplicate; }
    }
    throw new AppError(409, "Institution already exists. Edit the existing entry instead.");
  }
}

export const uploadUniversities = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError(400, "No file uploaded");
  if (![".csv", ".xls", ".xlsx"].includes(path.extname(req.file.path).toLowerCase())) throw new AppError(400, "Unsupported file type");
  const rows = await parseUniversityFile(req.file.path);
  let inserted = 0, updated = 0;
  const errors: { row: typeof rows[number]; error: string }[] = [];
  for (const row of rows) {
    try {
      const values = fields(row);
      const existing = await existingInstitution(values.name, values.country);
      if (existing) {
        existing.sourceFile = req.file.filename;
        await existing.save();
        updated++;
      } else {
        await University.create({ ...values, sourceFile: req.file.filename });
        inserted++;
      }
    } catch (error: any) { errors.push({ row, error: error.message }); }
  }
  res.status(200).json({ status: "success", summary: { processed: rows.length, inserted, updated, errors } });
});

export const createUniversity = catchAsync(async (req, res) => {
  const data = await saveNew(req.body);
  res.status(201).json({ status: "success", data });
});

export const listUniversities = catchAsync(async (_req, res) => {
  const data = await University.find({ active: { $ne: false } }).sort({ country: 1, name: 1 });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ status: "success", total: data.length, data });
});
export const manageUniversities = catchAsync(async (_req, res) => {
  const data = await University.find().sort({ country: 1, name: 1 });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ status: "success", total: data.length, data });
});

export const getUniversity = catchAsync(async (req, res) => {
  validId(req.params.id);
  const data = await University.findById(req.params.id);
  if (!data) throw new AppError(404, "Institution not found");
  res.status(200).json({ status: "success", data });
});

export const updateUniversity = catchAsync(async (req, res) => {
  validId(req.params.id);
  const body = req.body || {};
  if (!["name", "country", "active"].some(key => body[key] !== undefined)) throw new AppError(400, "Provide name, country or active status");
  const current = await University.findById(req.params.id);
  if (!current) throw new AppError(404, "Institution not found");
  const values = fields({ name: current.name, country: current.country, ...body });
  const duplicate = await existingInstitution(values.name, values.country);
  if (duplicate && String(duplicate._id) !== req.params.id) throw new AppError(409, "Institution already exists");
  try {
    const data = await University.findByIdAndUpdate(req.params.id, { $set: values }, { new: true, runValidators: true });
    if (!data) throw new AppError(404, "Institution not found");
    res.status(200).json({ status: "success", data });
  } catch (error: any) {
    if (error.code === 11000) throw new AppError(409, "Institution already exists");
    throw error;
  }
});

export const deleteUniversity = catchAsync(async (req, res) => {
  validId(req.params.id);
  const data = await University.findByIdAndDelete(req.params.id);
  if (!data) throw new AppError(404, "Institution not found");
  res.status(200).json({ status: "success", message: "University deleted successfully" });
});

async function savedInstitutions() {
  // Project no candidate identifiers or other profile information into the review queue.
  const rows = await Education.find({ instituteName: { $type: "string", $ne: "" } }).select("instituteName country -_id").lean();
  return groupInstitutions(rows);
}
export const listInstitutionSubmissions = catchAsync(async (req, res) => {
  const status = req.query.status || "pending";
  if (typeof status !== "string" || !["pending", "approved", "rejected"].includes(status)) throw new AppError(400, "Invalid review status");
  const [groups, catalog, decisions] = await Promise.all([
    savedInstitutions(), University.find().select("name country").lean(), InstitutionReview.find().lean(),
  ]);
  const reviewed = new Map(decisions.map(item => [item._id, item]));
  const knownInstitution = catalogInstitutionMatcher(catalog);
  const counts = new Map(groups.map(item => [item.key, item.count]));
  const data = status === "pending"
    ? groups.filter(item => !reviewed.has(item.key) && !knownInstitution(item))
    : decisions.filter(item => item.status === status).map(item => ({
        key: item._id, name: item.name, country: item.country, status: item.status,
        universityId: item.universityId, reviewedAt: item.updatedAt,
        count: counts.get(item._id) || 0,
      }));
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ status: "success", total: data.length, data });
});

export const reviewInstitutionSubmission = catchAsync(async (req, res) => {
  const { key, action, universityId, name, country } = req.body || {};
  if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key) || !["approve", "reject"].includes(action))
    throw new AppError(400, "Provide a valid submission key and approve or reject action");
  const groups = await savedInstitutions();
  const source = groups.find(item => item.key === key) || await InstitutionReview.findById(key).lean();
  if (!source) throw new AppError(404, "Institution submission not found");
  let target = null;
  if (action === "approve") {
    if (universityId !== undefined) {
      if (typeof universityId !== "string") throw new AppError(400, "Invalid institution ID");
      validId(universityId);
      target = await University.findById(universityId);
      if (!target) throw new AppError(404, "Catalog institution not found");
      target.active = true;
      await target.save();
    } else {
      target = await saveNew({ name: name ?? source.name, country: country ?? source.country, active: true }, true);
    }
  }
  const data = await InstitutionReview.findOneAndUpdate({ _id: key }, { $set: {
    name: source.name, country: source.country, status: action === "approve" ? "approved" : "rejected",
    universityId: target?._id || null, reviewedBy: req.user?._id,
  } }, { upsert: true, new: true, runValidators: true });
  res.status(200).json({ status: "success", data });
});
