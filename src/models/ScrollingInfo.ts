import { Document, Schema, model } from "mongoose";

export const SCROLLING_INFO_KEY = "main";

export const SCROLLING_INFO_ROLES = ["candidate", "recruiter", "company"] as const;
export type ScrollingInfoRole = (typeof SCROLLING_INFO_ROLES)[number];

export interface IScrollingInfoGroup {
  role: ScrollingInfoRole;
  buttonText: string;
  texts: string[];
}

export interface IScrollingInfo extends Document {
  key: string;
  enabled: boolean;
  speedSeconds: number;
  groups: IScrollingInfoGroup[];
}

export const DEFAULT_SCROLLING_INFO: Pick<
  IScrollingInfo,
  "enabled" | "speedSeconds" | "groups"
> = {
  enabled: true,
  speedSeconds: 70,
  groups: [
    {
      role: "candidate",
      buttonText: "Candidates Access",
      texts: [
        "Amplify your Profile",
        "IT",
        "Data",
        "AI",
        "Leadership",
        "Education",
        "Engineering",
        "Aviation",
        "Oil & Gas",
        "Health Care",
        "Social Care",
        "Legal",
        "Tradesmen",
        "Film & TV",
        "Marketing",
        "Catering",
        "Hospitality",
        "Content Creation",
        "Events Management",
        "Compères",
        "Multimedia",
        "Pharmaceutical",
        "Medical",
        "Leadership",
        "Admin",
        "Graduates",
        "Trainees",
        "Apprentices",
        "Experienced Professionals",
        "All Skills & All Levels Welcome",
        "Record Your Free 30-Second Elevator Pitch",
        "Apply to Jobs",
        "Start your Dream Job",
      ],
    },
    {
      role: "recruiter",
      buttonText: "Recruiters Access",
      texts: [
        "Post Job Adverts",
        "Hear the Pitch behind the Resume",
        "One-click Candidate feedback",
        "All job posts free until January 2027",
      ],
    },
    {
      role: "company",
      buttonText: "Companies Access",
      texts: [
        "60-Seconds Company Culture Pitch",
        "Post Job Adverts",
        "Hear the Pitch behind the Resume",
        "One-click Candidate feedback",
        "All job posts free until January 2027",
      ],
    },
  ],
};

const ScrollingInfoGroupSchema = new Schema<IScrollingInfoGroup>(
  {
    role: { type: String, enum: SCROLLING_INFO_ROLES, required: true },
    buttonText: { type: String, required: true, trim: true, maxlength: 80 },
    texts: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      required: true,
      validate: {
        validator: (items: string[]) => items.length <= 100,
        message: "A section can contain at most 100 messages.",
      },
    },
  },
  { _id: false }
);

const ScrollingInfoSchema = new Schema<IScrollingInfo>(
  {
    key: { type: String, required: true, unique: true, default: SCROLLING_INFO_KEY },
    enabled: { type: Boolean, default: true },
    speedSeconds: { type: Number, min: 10, max: 300, default: 70 },
    groups: { type: [ScrollingInfoGroupSchema], required: true },
  },
  { timestamps: true }
);

export default model<IScrollingInfo>("ScrollingInfo", ScrollingInfoSchema);
