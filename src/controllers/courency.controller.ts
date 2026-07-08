import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import csvParser from "csv-parser";

export interface ParsedItem {
  code: string;
  currencyName: string;
  primaryCountry?: string;
  symbol?: string;
}

export async function parseItemFile(filePath: string): Promise<ParsedItem[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return new Promise((resolve, reject) => {
      const rows: ParsedItem[] = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on("data", (row) => {
          const code = String(row["Code"] || "").trim();
          const currencyName = String(row["Currency Name"] || "").trim();
          const primaryCountry = String(row["Primary Country/Region"] || "").trim();
          const symbol = String(row["Symbol"] || "").trim();

          if (code && currencyName) {
            rows.push({ code, currencyName, primaryCountry, symbol });
          }
        })
        .on("end", () => resolve(rows))
        .on("error", (err) => reject(err));
    });
  }

  if (ext === ".xls" || ext === ".xlsx") {
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data: any[] = xlsx.utils.sheet_to_json(ws, { header: 0 });

    const rows: ParsedItem[] = [];
    for (const obj of data) {
      const code = String(obj["Code"] || "").trim();
      const currencyName = String(obj["Currency Name"] || "").trim();
      const primaryCountry = String(obj["Primary Country/Region"] || "").trim();
      const symbol = String(obj["Symbol"] || "").trim();

      if (code && currencyName) {
        rows.push({ code, currencyName, primaryCountry, symbol });
      }
    }
    return rows;
  }

  throw new Error("Unsupported file type");
}

import { Request, Response } from "express";
import { Item } from "../models/courency.model";
import AppError from "../errors/AppError";

export const uploadItems = async (req: Request, res: Response) => {
  try {
    if (!req.file) throw new AppError(400, "No file uploaded");

    const rows: ParsedItem[] = await parseItemFile(req.file.path);
    let inserted = 0,
      updated = 0;
    const errors: any[] = [];

    for (const row of rows) {
      try {
        const { code, currencyName, primaryCountry, symbol } = row;
        const existing = await Item.findOne({ code });

        if (existing) {
          existing.currencyName = currencyName;
          existing.primaryCountry = primaryCountry;
          existing.symbol = symbol;
          existing.sourceFile = req.file.filename;
          await existing.save();
          updated++;
        } else {
          await Item.create({
            code,
            currencyName,
            primaryCountry,
            symbol,
            sourceFile: req.file.filename,
          });
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


export const createItem = async (req: Request, res: Response) => {
  try {
    const { category, name, description } = req.body;
    if (!category || !name) {
       res.status(400).json({ status: "fail", message: "Category and name are required" });
    }
    const existing = await Item.findOne({ category, name });
    if (existing) {
       res.status(409).json({ status: "fail", message: "Item already exists" });
    }
    const item = await Item.create({ category, name, description });
     res.status(201).json({ status: "success", data: item });
  } catch (err: any) {
     res.status(500).json({ status: "error", message: err.message });
  }
};

export const listItems = async (req: Request, res: Response) => {
  try {

    const [items, total] = await Promise.all([
      Item.find().sort({ category: 1, name: 1 }),
      Item.countDocuments(),
    ]);

     res.status(200).json({ status: "success", total, data: items });
  } catch (err: any) {
     res.status(500).json({ status: "error", message: err.message });
  }
};

export const getItem = async (req: Request, res: Response) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item)  res.status(404).json({ status: "fail", message: "Item not found" });
     res.status(200).json({ status: "success", data: item });
  } catch (err: any) {
     res.status(500).json({ status: "error", message: err.message });
  }
};

export const updateItem = async (req: Request, res: Response) => {
  try {
    const updateFields: any = {};
    if (req.body.category !== undefined) updateFields.category = req.body.category;
    if (req.body.name !== undefined) updateFields.name = req.body.name;
    if (req.body.description !== undefined) updateFields.description = req.body.description;

    const item = await Item.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true });
    if (!item)  res.status(404).json({ status: "fail", message: "Item not found" });
     res.status(200).json({ status: "success", data: item });
  } catch (err: any) {
     res.status(500).json({ status: "error", message: err.message });
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item)  res.status(404).json({ status: "fail", message: "Item not found" });
     res.status(200).json({ status: "success", message: "Item deleted successfully" });
  } catch (err: any) {
     res.status(500).json({ status: "error", message: err.message });
  }
};
