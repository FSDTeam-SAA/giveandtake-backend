import type { IJob, IApplicationRequirement } from "../interface/job.interface";
import type { ICreateResume } from "../interface/createResume.interface";
import type { IExperience } from "../interface/experience.interface";
import type { IEducation } from "../interface/education.interface";
import stripHtml from "./stripHtml";

export const MAX_CONTEXT_CHAR = 3200;

const clean = (value?: string | null) => {
  if (!value) return "";
  return stripHtml(value).trim();
};

export const buildJobText = (
  job: Partial<IJob>,
  limit: number = MAX_CONTEXT_CHAR
): string => {
  if (!job) {
    return "";
  }

  const segments: string[] = [];

  if (job.title) {
    segments.push(`Title: ${clean(job.title)}`);
  }
  if (job.companyName) {
    segments.push(`Company: ${clean(job.companyName)}`);
  }
  if (job.description) {
    segments.push(`Description: ${clean(job.description)}`);
  }
  if (job.responsibilities?.length) {
    const entries = job.responsibilities
      .map((item) => clean(item))
      .filter(Boolean);
    if (entries.length) {
      segments.push(`Responsibilities:\n- ${entries.join("\n- ")}`);
    }
  }
  if (job.educationExperience?.length) {
    const entries = job.educationExperience
      .map((item) => clean(item))
      .filter(Boolean);
    if (entries.length) {
      segments.push(`Required Experience:\n- ${entries.join("\n- ")}`);
    }
  }
  if (job.applicationRequirement?.length) {
    const reqText = job.applicationRequirement
      .map((req: Partial<IApplicationRequirement>) =>
        `${clean(req.requirement)} ${clean(req.status)}`.trim()
      )
      .filter(Boolean)
      .join("\n- ");
    if (reqText) {
      segments.push(`Application Requirements:\n- ${reqText}`);
    }
  }
  if (job.employement_Type || job.location_Type || job.career_Stage) {
    segments.push(
      `Role Details: ${[
        clean(job.employement_Type),
        clean(job.location_Type),
        clean(job.career_Stage),
      ]
        .filter(Boolean)
        .join(" | ")}`
    );
  }

  return truncateText(segments.join("\n\n"), limit);
};

export const buildProfileText = (
  resume: Partial<ICreateResume>,
  experiences?: Array<Partial<IExperience>>,
  education?: Array<Partial<IEducation>>,
  limit: number = MAX_CONTEXT_CHAR
): string => {
  const segments: string[] = [];

  if (resume?.title) {
    segments.push(`Headline: ${clean(resume.title)}`);
  }
  if (resume?.aboutUs) {
    const text = clean(resume.aboutUs);
    if (text) segments.push(`Summary: ${text}`);
  }
  if (resume?.professionalSummary) {
    const text = clean(resume.professionalSummary);
    if (text) segments.push(`Professional Summary: ${text}`);
  }
  if (resume?.skills?.length) {
    const entries = resume.skills.map((skill) => clean(skill)).filter(Boolean);
    if (entries.length) {
      segments.push(`Skills:\n- ${entries.join("\n- ")}`);
    }
  }
  if (resume?.certifications?.length) {
    const entries = resume.certifications
      .map((cert) => clean(cert))
      .filter(Boolean);
    if (entries.length) {
      segments.push(`Certifications:\n- ${entries.join("\n- ")}`);
    }
  }
  if (experiences?.length) {
    const expText = experiences
      .map(
        (exp: Partial<IExperience>) =>
          `${clean(exp.position ?? exp.company)} ${clean(exp.jobDescription)}`.trim()
      )
      .filter(Boolean)
      .join("\n- ");
    if (expText) {
      segments.push(`Experience:\n- ${expText}`);
    }
  }
  if (education?.length) {
    const eduText = education
      .map((ed: Partial<IEducation>) =>
        `${clean(ed.degree)} ${clean(ed.fieldOfStudy)}`.trim()
      )
      .filter(Boolean)
      .join("\n- ");
    if (eduText) {
      segments.push(`Education:\n- ${eduText}`);
    }
  }
  if (resume?.languages?.length) {
    const entries = resume.languages
      .map((lang) => clean(lang))
      .filter(Boolean);
    if (entries.length) {
      segments.push(`Languages:\n- ${entries.join("\n- ")}`);
    }
  }

  return truncateText(segments.join("\n\n"), limit);
};

const truncateText = (value: string, limit: number): string => {
  if (!value) {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
};
