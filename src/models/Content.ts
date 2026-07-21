import { Schema, model, Document } from "mongoose";

/**
 * The original fixed set of pages. These are "system" pages that always exist
 * and can be edited but never deleted from the admin dashboard. Dynamic pages
 * created by an admin (e.g. "csae-standards", "mobile-app-policy") use their
 * slug as the `type` and are marked `isSystem: false`.
 */
export const BUILT_IN_CONTENT_TYPES = [
  "about",
  "privacy",
  "candidate",
  "recruiter",
  "company",
  "terms",
] as const;

export interface IContent extends Document {
  /** Slug-style unique key used in the public URL (`/pages/:type`). */
  type: string;
  title: string;
  description: string; // stores HTML from rich text editor
  /** Built-in pages cannot be deleted and their slug cannot change. */
  isSystem: boolean;
  /** Unpublished custom pages are hidden from the public site. */
  published: boolean;
}

const ContentSchema = new Schema<IContent>(
  {
    type: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    published: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default model<IContent>("Content", ContentSchema);
