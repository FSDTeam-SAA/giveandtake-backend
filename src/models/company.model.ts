import mongoose, { Schema } from "mongoose";
import { ICompany, CompanyModel } from "../interface/company.interface";

const companySchema: Schema<ICompany> = new Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clogo: { type: String },
    banner: { type: String },
    aboutUs: { type: String },  
    slug: { type: String, unique: true },
    cname: { type: String, required: true },
    country: { type: String, required: true },
    city: { type: String, required: true },
    zipcode: { type: String },
    cemail: { type: String, required: true },
    sLink: [
      {
        label: { type: String },
        url: { type: String },
      },
    ],
    industry: { type: String },
    service: [{ type: String }],
    employeesId: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  {
    timestamps: true,
  }
);

// Drives people-search $lookup and the many findOne({ userId }) calls
companySchema.index({ userId: 1 }, { name: "company_user_idx" });

export const Company = mongoose.model<ICompany, CompanyModel>(
  "Company",
  companySchema
);
