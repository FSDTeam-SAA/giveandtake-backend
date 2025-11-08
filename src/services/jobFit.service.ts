import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  IApplicationRequirement,
  IJob,
} from "../interface/job.interface";
import type { ICreateResume } from "../interface/createResume.interface";
import type { IExperience } from "../interface/experience.interface";
import type { IEducation } from "../interface/education.interface";

const DEFAULT_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash-lite";
const MAX_CONTEXT_CHAR = 3200;

type MaybeArray<T> = T | T[] | undefined | null;

type FitAiResponse = {
  jobSkills?: string[];
  profileSkills?: string[];
  matchedSkills?: string[];
  missingSkills?: string[];
  matchPercentage?: number;
  summary?: string;
};

const SCORE_LABELS = [
  {
    code: "MISSING_MOST",
    min: 0,
    max: 25,
    message:
      "Your profile is missing several required qualifications for this job.",
  },
  {
    code: "MISSING_SOME",
    min: 25,
    max: 50,
    message:
      "Your profile is missing some required qualifications for this job.",
  },
  {
    code: "PARTIAL_MATCH",
    min: 50,
    max: 75,
    message: "Your profile matches some required qualifications for this job.",
  },
  {
    code: "STRONG_MATCH",
    min: 75,
    max: 101,
    message:
      "Your profile matches several required qualifications for this job.",
  },
] as const;

export type JobFitVerdictCode = (typeof SCORE_LABELS)[number]["code"];

export interface JobFitSummary {
  score: number;
  verdictCode: JobFitVerdictCode;
  verdictMessage: string;
  jobSkills: string[];
  profileSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  aiSummary: string;
  metrics: {
    jobSkillCount: number;
    profileSkillCount: number;
    matchedSkillCount: number;
  };
  model?: string;
}

type EvaluatePayload = {
  job: Partial<IJob>;
  resume: Partial<ICreateResume>;
  experiences?: Array<Partial<IExperience>>;
  education?: Array<Partial<IEducation>>;
};

class JobFitService {
  private readonly chatModel: ChatGoogleGenerativeAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY for job fit analysis");
    }

    this.chatModel = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: DEFAULT_CHAT_MODEL,
      temperature: 0.2,
      maxOutputTokens: 512,
    });
  }

  async evaluate(payload: EvaluatePayload): Promise<JobFitSummary> {
    const jobText = this.composeJobText(payload.job);
    const profileText = this.composeProfileText(
      payload.resume,
      payload.experiences,
      payload.education
    );

    const aiResponse = await this.callGemini(jobText, profileText);

    const heuristicJobSkills = this.extractHeuristicSkills([
      payload.job.title,
      payload.job.role,
      payload.job.description,
      payload.job.responsibilities,
      payload.job.educationExperience,
      payload.job.benefits,
      payload.job.applicationRequirement?.map(
        (item: Partial<IApplicationRequirement>) =>
          `${item.requirement ?? ""} ${item.status ?? ""}`
      ),
    ]);

    const heuristicProfileSkills = this.extractHeuristicSkills([
      payload.resume.title,
      payload.resume.aboutUs,
      payload.resume.professionalSummary,
      payload.resume.skills,
      payload.resume.languages,
      payload.resume.certifications,
      payload.experiences?.map(
        (exp: Partial<IExperience>) =>
          `${exp.position ?? ""} ${exp.jobDescription ?? ""} ${
            exp.careerField ?? ""
          }`
      ),
      payload.education?.map(
        (ed: Partial<IEducation>) =>
          `${ed.degree ?? ""} ${ed.fieldOfStudy ?? ""}`
      ),
    ]);

    const parsedJobSkills = this.dedupeSkills([
      ...(aiResponse?.jobSkills ?? []),
      ...heuristicJobSkills,
    ]);
    const parsedProfileSkills = this.dedupeSkills([
      ...(aiResponse?.profileSkills ?? []),
      ...heuristicProfileSkills,
    ]);

    const matchedSkills = parsedJobSkills.list.filter((skill) =>
      parsedProfileSkills.set.has(this.normalizeSkill(skill))
    );
    const missingSkills = parsedJobSkills.list.filter(
      (skill) => !parsedProfileSkills.set.has(this.normalizeSkill(skill))
    );

    const jobCoverage = parsedJobSkills.list.length
      ? matchedSkills.length / parsedJobSkills.list.length
      : 0;
    const profileCoverage = parsedProfileSkills.list.length
      ? matchedSkills.length / parsedProfileSkills.list.length
      : jobCoverage;

    const blendedScore =
      (jobCoverage * 0.7 + profileCoverage * 0.3) * 100;

    const score = this.safeScore(
      aiResponse?.matchPercentage ?? blendedScore
    );

    const verdict = SCORE_LABELS.find(
      (label) => score >= label.min && score < label.max
    ) ?? SCORE_LABELS[0];

    const aiSummary =
      aiResponse?.summary ??
      this.buildDefaultSummary(matchedSkills.length, parsedJobSkills.list.length);

    return {
      score,
      verdictCode: verdict.code,
      verdictMessage: verdict.message,
      jobSkills: parsedJobSkills.list,
      profileSkills: parsedProfileSkills.list,
      matchedSkills,
      missingSkills,
      aiSummary,
      metrics: {
        jobSkillCount: parsedJobSkills.list.length,
        profileSkillCount: parsedProfileSkills.list.length,
        matchedSkillCount: matchedSkills.length,
      },
      model: DEFAULT_CHAT_MODEL,
    };
  }

  private async callGemini(
    jobText: string,
    profileText: string
  ): Promise<FitAiResponse | null> {
    if (!jobText || !profileText) {
      return null;
    }

    try {
      const systemPrompt = new SystemMessage(
        "You compare job descriptions with candidate profiles. " +
          "Return a compact JSON object with up to 12 job skills and 12 profile skills. " +
          "Do not use prose outside the JSON."
      );
      const instruction = new HumanMessage(
        [
          "Compare the following job description and candidate profile.",
          "Return strict JSON with keys: jobSkills (string[]), profileSkills (string[]),",
          "matchedSkills (string[]), missingSkills (string[]), matchPercentage (0-100 number), summary (<=40 words).",
          "JOB DESCRIPTION:",
          jobText,
          "PROFILE:",
          profileText,
        ].join("\n\n")
      );

      const completion = await this.chatModel.invoke([
        systemPrompt,
        instruction,
      ]);
      const raw = this.extractText(completion.content);
      if (!raw) {
        return null;
      }
      return this.parseAiJson(raw);
    } catch (error) {
      console.warn(
        "[job-fit] Gemini comparison failed:",
        (error as Error).message
      );
      return null;
    }
  }

  private composeJobText(job: Partial<IJob>): string {
    const segments: string[] = [];
    if (job.title) {
      segments.push(`Title: ${job.title}`);
    }
    if (job.companyName) {
      segments.push(`Company: ${job.companyName}`);
    }
    if (job.description) {
      segments.push(`Description: ${job.description}`);
    }
    if (job.responsibilities?.length) {
      segments.push(
        `Responsibilities:\n- ${job.responsibilities.join("\n- ")}`
      );
    }
    if (job.educationExperience?.length) {
      segments.push(
        `Required Experience:\n- ${job.educationExperience.join("\n- ")}`
      );
    }
    if (job.applicationRequirement?.length) {
      segments.push(
        `Application Requirements:\n- ${job.applicationRequirement
          .map((req: Partial<IApplicationRequirement>) =>
            `${req.requirement ?? ""} ${req.status ?? ""}`.trim()
          )
          .filter(Boolean)
          .join("\n- ")}`
      );
    }
    if (job.employement_Type || job.location_Type || job.career_Stage) {
      segments.push(
        `Role Details: ${[
          job.employement_Type,
          job.location_Type,
          job.career_Stage,
        ]
          .filter(Boolean)
          .join(" | ")}`
      );
    }
    return this.truncateText(segments.join("\n\n"));
  }

  private composeProfileText(
    resume: Partial<ICreateResume>,
    experiences?: Array<Partial<IExperience>>,
    education?: Array<Partial<IEducation>>
  ): string {
    const segments: string[] = [];
    if (resume.title) {
      segments.push(`Headline: ${resume.title}`);
    }
    if (resume.aboutUs) {
      segments.push(`Summary: ${resume.aboutUs}`);
    }
    if (resume.professionalSummary) {
      segments.push(`Professional Summary: ${resume.professionalSummary}`);
    }
    if (resume.skills?.length) {
      segments.push(`Skills:\n- ${resume.skills.join("\n- ")}`);
    }
    if (resume.certifications?.length) {
      segments.push(`Certifications:\n- ${resume.certifications.join("\n- ")}`);
    }
    if (experiences?.length) {
      segments.push(
        `Experience:\n- ${experiences
          .map(
            (exp: Partial<IExperience>) =>
              `${exp.position ?? exp.company ?? ""} ${exp.jobDescription ?? ""}`
          )
          .filter(Boolean)
          .join("\n- ")}`
      );
    }
    if (education?.length) {
      segments.push(
        `Education:\n- ${education
          .map((ed: Partial<IEducation>) =>
            `${ed.degree ?? ""} ${ed.fieldOfStudy ?? ""}`.trim()
          )
          .filter(Boolean)
          .join("\n- ")}`
      );
    }
    if (resume.languages?.length) {
      segments.push(`Languages:\n- ${resume.languages.join("\n- ")}`);
    }
    return this.truncateText(segments.join("\n\n"));
  }

  private extractHeuristicSkills(
    rawInput: MaybeArray<string | undefined | null | string[]>
  ): string[] {
    const accumulator: string[] = [];

    const flatten = (
      value: MaybeArray<string | string[] | undefined | null>
    ) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) =>
          flatten(entry as MaybeArray<string | string[] | undefined | null>)
        );
        return;
      }
      accumulator.push(value);
    };

    flatten(rawInput as MaybeArray<string | string[] | undefined | null>);

    const stopWords = new Set([
      "and",
      "or",
      "of",
      "with",
      "the",
      "to",
      "for",
      "in",
      "a",
      "an",
      "our",
      "your",
      "experience",
      "skills",
      "required",
      "responsibilities",
      "ability",
      "work",
    ]);

    const skills: string[] = [];

    for (const chunk of accumulator) {
      if (!chunk) continue;
      const tokens = chunk
        .split(/[\n\r,;•\u2022\-|]/)
        .map((token) =>
          token
            .replace(/[^a-z0-9+#/.&\s]/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter((token) => token.length > 1 && token.length <= 45);

      for (const token of tokens) {
        const normalized = token.toLowerCase();
        if (stopWords.has(normalized)) continue;
        skills.push(token);
      }
    }

    return skills;
  }

  private dedupeSkills(skills: string[]) {
    const displayList: string[] = [];
    const normalizedSet = new Set<string>();

    for (const skill of skills) {
      const formatted = this.formatSkill(skill);
      const normalized = this.normalizeSkill(formatted);
      if (!normalized || normalizedSet.has(normalized)) {
        continue;
      }
      normalizedSet.add(normalized);
      displayList.push(formatted);
      if (displayList.length >= 25) {
        break;
      }
    }

    return {
      list: displayList,
      set: normalizedSet,
    };
  }

  private normalizeSkill(skill: string): string {
    return skill
      .toLowerCase()
      .replace(/[^a-z0-9+#/.&\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private formatSkill(skill: string): string {
    const trimmed = skill.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.length <= 4) {
      return trimmed.toUpperCase();
    }
    return trimmed
      .split(" ")
      .map((word) =>
        word.length
          ? word[0].toUpperCase() + word.slice(1).toLowerCase()
          : ""
      )
      .join(" ")
      .trim();
  }

  private parseAiJson(raw: string): FitAiResponse | null {
    const clean = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    try {
      const parsed = JSON.parse(clean) as FitAiResponse;
      return parsed;
    } catch (error) {
      console.warn("[job-fit] Failed to parse AI JSON:", clean);
      return null;
    }
  }

  private extractText(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === "string"
            ? part
            : typeof part?.text === "string"
            ? part.text
            : ""
        )
        .join("");
    }
    if (content && typeof content === "object" && "text" in content) {
      return String((content as { text?: string }).text ?? "");
    }
    return "";
  }

  private truncateText(value: string, limit = MAX_CONTEXT_CHAR): string {
    if (!value) {
      return "";
    }
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, limit)}…`;
  }

  private safeScore(score: number | undefined | null): number {
    if (typeof score !== "number" || Number.isNaN(score)) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
  }

  private buildDefaultSummary(
    matched: number,
    totalRequired: number
  ): string {
    if (!totalRequired) {
      return "Not enough job data to calculate a skill match.";
    }
    return `Matched ${matched} of ${totalRequired} highlighted requirements.`;
  }
}

export const jobFitService = new JobFitService();
