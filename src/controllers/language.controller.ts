// utils/fileParser.ts
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import csvParser from "csv-parser";

export async function parseFileToRows(filePath: string): Promise<{ name: string }[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return new Promise((resolve, reject) => {
      const rows: { name: string }[] = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on("data", (row) => {
          // if CSV has no headers, row will be { 'Column1': 'value' }
          // adjust depending on your CSV format
          const firstValue = Object.values(row)[0];
          if (firstValue) rows.push({ name: String(firstValue).trim() });
        })
        .on("end", () => resolve(rows))
        .on("error", (err) => reject(err));
    });
  }

  if (ext === ".xls" || ext === ".xlsx") {
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[];
    return data
      .filter((r: any[]) => r && r.length > 0 && r[0])
      .map((r: any[]) => ({ name: String(r[0]).trim() }));
  }

  throw new Error("Unsupported file type");
}



// controllers/languageController.ts
import { Request, Response } from "express";
import { Language } from "../models/language.model";
import AppError from "../errors/AppError";

export const uploadLanguages = async (req: Request, res: Response) => {
  try {
    if (!req.file)  throw new AppError(400,"No file uploaded" );

    const rows = await parseFileToRows(req.file.path);

    let inserted = 0, updated = 0;

    for (const row of rows) {
      const existing = await Language.findOne({ name: row.name });
      if (existing) {
        existing.sourceFile = req.file.filename;
        await existing.save();
        updated++;
      } else {
        await Language.create({ name: row.name, sourceFile: req.file.filename });
        inserted++;
      }
    }

     res.json({ status: "success", summary: { processed: rows.length, inserted, updated } });
  } catch (err: any) {
     res.status(500).json({ status: "error", message: err.message });
  }
};

export const createLanguage = async (req: Request, res: Response) => {
  try {
    const lang = await Language.create(req.body);
    res.status(201).json({ status: "success", data: lang });
  } catch (err: any) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

export const listLanguages = async (_req: Request, res: Response) => {
  const langs = await Language.find().sort({ name: 1 });
  res.json({ status: "success", data: langs });
};

export const getLanguage = async (req: Request, res: Response) => {
  const lang = await Language.findById(req.params.id);
  if (!lang)  res.status(404).json({ status: "fail", message: "Language not found" });
  res.json({ status: "success", data: lang });
};

export const updateLanguage = async (req: Request, res: Response) => {
  const lang = await Language.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!lang)  res.status(404).json({ status: "fail", message: "Language not found" });
  res.json({ status: "success", data: lang });
};

export const deleteLanguage = async (req: Request, res: Response) => {
  const lang = await Language.findByIdAndDelete(req.params.id);
  if (!lang)  res.status(404).json({ status: "fail", message: "Language not found" });
  res.json({ status: "success", message: "Language deleted successfully" });
};
