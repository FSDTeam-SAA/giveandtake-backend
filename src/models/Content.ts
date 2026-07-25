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

export type BuiltInContentType = (typeof BUILT_IN_CONTENT_TYPES)[number];

/**
 * Default titles for the built-in pages. Used only when a page does not exist
 * yet in the current database — the admin dashboard is free to rename them
 * afterwards and a seed pass never overwrites an existing title.
 *
 * These are the visitor-facing titles: the three card types are rendered as the
 * Candidate/Recruiter/Company cards in the homepage "How It Works" section.
 */
export const BUILT_IN_CONTENT_DEFAULTS: Record<BuiltInContentType, string> = {
  about: "About Us",
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  candidate: "Candidates",
  recruiter: "Recruiters",
  company: "Companies",
};

const builtInSet = new Set<string>(BUILT_IN_CONTENT_TYPES);

/** Normalises a slug/type the same way the schema does before it is persisted. */
export const normalizeContentType = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** True when `type` is one of the six pages that always exist. */
export const isBuiltInContentType = (value: unknown): boolean =>
  builtInSet.has(normalizeContentType(value));

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
    // Not `required`: a freshly seeded built-in page starts empty until an
    // admin writes it, and clearing a page's body is a legitimate edit.
    description: {
      type: String,
      default: "",
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
