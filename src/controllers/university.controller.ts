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


// controllers/universityController.ts
import { Request, Response } from "express";
import { University } from "../models/university.model";
import AppError from "../errors/AppError";


export const uploadUniversities = async (req: Request, res: Response) => {
  try {
    if (!req.file) throw new AppError(400,"No file uploaded" );

    const rows = await parseUniversityFile(req.file.path);

    let inserted = 0;
    let updated = 0;
    const errors: any[] = [];

    for (const row of rows) {
      try {
        const { country, name } = row;
        // upsert by country+name
        const existing = await University.findOne({ country, name });
        if (existing) {
          existing.sourceFile = req.file.filename;
          await existing.save();
          updated++;
        } else {
          await University.create({ country, name, sourceFile: req.file.filename });
          inserted++;
        }
      } catch (err: any) {
        errors.push({ row, error: err.message });
      }
    }

   res.status(200).json({
      status: "success",
      summary: {
        processed: rows.length,
        inserted,
        updated,
        errors,
      },
    });
  } catch (err: any) {
   res.status(500).json({ status: "error", message: err.message });
  }
};

export const createUniversity = async (req: Request, res: Response) => {
  try {
    const { country, name } = req.body;
    if (!country || !name) {
     res.status(400).json({ status: "fail", message: "Country and name are required" });
    }
    const existing = await University.findOne({ country, name });
    if (existing) {
     res.status(409).json({ status: "fail", message: "University already exists" });
    }
    const uni = await University.create({ country, name });
   res.status(201).json({ status: "success", data: uni });
  } catch (err: any) {
   res.status(500).json({ status: "error", message: err.message });
  }
};

export const listUniversities = async (req: Request, res: Response) => {
  try {


    const [items, total] = await Promise.all([
      University.find().sort({ country: 1, name: 1 }),
      University.countDocuments(),
    ]);

   res.status(200).json({ status: "success", total, data: items });
  } catch (err: any) {
   res.status(500).json({ status: "error", message: err.message });
  }
};

export const getUniversity = async (req: Request, res: Response) => {
  try {
    const uni = await University.findById(req.params.id);
    if (!uni) {
     res.status(404).json({ status: "fail", message: "University not found" });
    }
   res.status(200).json({ status: "success", data: uni });
  } catch (err: any) {
   res.status(500).json({ status: "error", message: err.message });
  }
};

export const updateUniversity = async (req: Request, res: Response) => {
  try {
    const { country, name } = req.body;
    if (country === undefined && name === undefined) {
     res.status(400).json({ status: "fail", message: "At least one of country or name must be provided" });
    }
    const updateObj: any = {};
    if (country) updateObj.country = country;
    if (name) updateObj.name = name;

    const uni = await University.findByIdAndUpdate(req.params.id, updateObj, { new: true, runValidators: true });
    if (!uni) {
     res.status(404).json({ status: "fail", message: "University not found" });
    }
   res.status(200).json({ status: "success", data: uni });
  } catch (err: any) {
   res.status(500).json({ status: "error", message: err.message });
  }
};

export const deleteUniversity = async (req: Request, res: Response) => {
  try {
    const uni = await University.findByIdAndDelete(req.params.id);
    if (!uni) {
     res.status(404).json({ status: "fail", message: "University not found" });
    }
   res.status(200).json({ status: "success", message: "University deleted successfully" });
  } catch (err: any) {
   res.status(500).json({ status: "error", message: err.message });
  }
};

