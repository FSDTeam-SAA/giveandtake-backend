import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  IApplicationRequirement,
  IJob,
} from "../interface/job.interface";
import type { ICreateResume } from "../interface/createResume.interface";
import type { IExperience } from "../interface/experience.interface";
import type { IEducation } from "../interface/education.interface";
import {
  areEmbeddingsEnabled,
  cosineSimilarity,
  generateJobEmbeddingVector,
  generateProfileEmbeddingVector,
} from "./embedding.service";
import { buildJobText, buildProfileText } from "../utils/jobFitText";
import { mapSkillSynonym } from "./skillMapper.service";
import stripHtml from "../utils/stripHtml";

const DEFAULT_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash-lite";

type MaybeArray<T> = T | T[] | undefined | null;

type FitAiResponse = {
  jobSkills?: string[];
  profileSkills?: string[];
  matchedSkills?: string[];
  missingSkills?: string[];
  matchPercentage?: number;
  summary?: string;
};

type WeightedSkillSource = {
  data: MaybeArray<string | string[]>;
  weight?: number;
};

const VERB_PREFIXES = new Set([
  "develop",
  "design",
  "implement",
  "optimize",
  "write",
  "collaborate",
  "translate",
  "ensure",
  "maintain",
  "participate",
  "build",
  "stay",
  "deliver",
  "create",
  "drive",
]);

const BANNED_WORDS_ANYWHERE = new Set([
  "resume",
  "required",
  "responsibilities",
  "overall",
  "loading",
  "times",
  "maintainable",
  "clean",
  "kpi",
  "targets",
  "objectives",
]);

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
  private chatModel?: ChatGoogleGenerativeAI;
  private aiEnabled: boolean;

  constructor() {
    this.aiEnabled = (process.env.JOB_FIT_AI ?? "on").toLowerCase() !== "off";
  }

  private ensureChatModel(): boolean {
    if (!this.aiEnabled) {
      return false;
    }
    if (this.chatModel) {
      return true;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[job-fit] GEMINI_API_KEY missing; falling back to heuristic+embedding mode."
      );
      this.aiEnabled = false;
      return false;
    }
    this.chatModel = new ChatGoogleGenerativeAI({
      apiKey,
      model: DEFAULT_CHAT_MODEL,
      temperature: 0.2,
      maxOutputTokens: 512,
    });
    return true;
  }

  async evaluate(payload: EvaluatePayload): Promise<JobFitSummary> {
    const jobText = buildJobText(payload.job);
    const profileText = buildProfileText(
      payload.resume,
      payload.experiences,
      payload.education
    );

    const aiResponse = await this.callGemini(jobText, profileText);

    const resumeSkillList = (payload.resume.skills ?? [])
      .map((skill) => stripHtml(String(skill ?? "")).trim())
      .filter((skill) => skill.length);

    const heuristicJobSkills = this.extractHeuristicSkills([
      { data: payload.job.title, weight: 0.4 },
      { data: payload.job.role, weight: 0.4 },
      { data: payload.job.description, weight: 0.8 },
      { data: payload.job.responsibilities, weight: 1.3 },
      { data: payload.job.educationExperience, weight: 1.1 },
      { data: payload.job.benefits, weight: 0.3 },
      {
        data: payload.job.applicationRequirement?.map(
          (item: Partial<IApplicationRequirement>) =>
            `${item.requirement ?? ""} ${item.status ?? ""}`
        ),
        weight: 1.5,
      },
    ]);

    const heuristicProfileSkills = this.extractHeuristicSkills([
      { data: payload.resume.title, weight: 0.5 },
      { data: payload.resume.aboutUs, weight: 0.4 },
      { data: payload.resume.professionalSummary, weight: 0.8 },
      { data: payload.resume.skills, weight: 1.4 },
      { data: payload.resume.languages, weight: 0.2 },
      { data: payload.resume.certifications, weight: 0.8 },
      {
        data: payload.experiences?.map(
          (exp: Partial<IExperience>) =>
            `${exp.position ?? ""} ${exp.jobDescription ?? ""} ${
              exp.careerField ?? ""
            }`
        ),
        weight: 1.1,
      },
      {
        data: payload.education?.map(
          (ed: Partial<IEducation>) =>
            `${ed.degree ?? ""} ${ed.fieldOfStudy ?? ""}`
        ),
        weight: 0.6,
      },
    ]);

    const parsedJobSkills = this.dedupeSkills([
      ...(aiResponse?.jobSkills ?? []),
      ...heuristicJobSkills,
    ]);
    const parsedProfileSkills = this.dedupeSkills([
      ...resumeSkillList,
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

    const heuristicScore = this.safeScore(
      (jobCoverage * 0.7 + profileCoverage * 0.3) * 100
    );

    let embeddingScore: number | null = null;
    if (areEmbeddingsEnabled()) {
      const [jobEmbedding, profileEmbedding] = await Promise.all([
        generateJobEmbeddingVector(payload.job),
        generateProfileEmbeddingVector(
          payload.resume,
          payload.experiences,
          payload.education
        ),
      ]);

      const similarity = cosineSimilarity(jobEmbedding, profileEmbedding);
      if (similarity > 0) {
        embeddingScore = this.safeScore(similarity * 100);
      }
    }

    const weightedScores = [{ value: heuristicScore, weight: 0.5 }];

    if (embeddingScore !== null) {
      weightedScores.push({ value: embeddingScore, weight: 0.3 });
    }

    if (
      this.aiEnabled &&
      typeof aiResponse?.matchPercentage === "number"
    ) {
      weightedScores.push({
        value: aiResponse.matchPercentage,
        weight: 0.5,
      });
    }

    const totalWeight = weightedScores.reduce(
      (sum, item) => sum + item.weight,
      0
    );

    const score = this.safeScore(
      weightedScores.reduce(
        (sum, item) => sum + item.value * item.weight,
        0
      ) / totalWeight
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
      model: this.aiEnabled && this.chatModel
        ? DEFAULT_CHAT_MODEL
        : "heuristic+GeminiEmb",
    };
  }

  private async callGemini(
    jobText: string,
    profileText: string
  ): Promise<FitAiResponse | null> {
    if (!this.aiEnabled || !jobText || !profileText) {
      return null;
    }
    if (!this.ensureChatModel() || !this.chatModel) {
      return null;
    }

    try {
      const systemPrompt = new SystemMessage(
        "You compare job descriptions with candidate profiles across all job types (technical, non-technical, operations, creative, sales, etc.). " +
          "Return a compact JSON object with up to 12 job skills and 12 profile skills. " +
          "Each entry must be a concise skill/qualification (1-3 words): technologies, tools, methods, certifications, soft skills (e.g., Communication), or role-specific competencies. " +
          "Do NOT include verbs, responsibilities, sentences, or numbered items. Use strict JSON only."
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
          "Prioritize explicit skills listed in the candidate profile (e.g., Skills section). " +
            "Return only genuine skills/technologies â€” no responsibilities, verbs, or requirements.",
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

  private extractHeuristicSkills(
    sources: WeightedSkillSource[]
  ): string[] {
    const scores = new Map<string, number>();
    for (const source of sources) {
      const tokens = this.tokenizeSkillCandidates(source.data);
      if (!tokens.length) continue;
      const weight = source.weight ?? 1;
      if (weight <= 0) continue;
      for (const token of tokens) {
        scores.set(token, (scores.get(token) ?? 0) + weight);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([skill]) => skill);
  }

  private tokenizeSkillCandidates(
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
      const sanitized = stripHtml(String(value ?? "")).trim();
      if (sanitized) {
        accumulator.push(sanitized);
      }
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
      "skills",
      "ability",
      "work",
      "preferred",
    ]);

    const skills: string[] = [];

    for (const chunk of accumulator) {
      if (!chunk) continue;
      const normalizedChunk = chunk.replace(/\. (?=[A-Z])/g, "\n");
      const tokens = normalizedChunk
        .split(/[\n\r,;â€¢\u2022|]+/)
        .map((token) =>
          token
            .replace(/^\d+(\.|-)?\s*/, "")
            .replace(/[.?!,:]+$/g, "")
            .trim()
        )
        .filter((token) => token.length > 1 && token.length <= 45);

      for (const rawToken of tokens) {
        let token = rawToken;
        if (!token) continue;
        const normalized = token
          .toLowerCase()
          .replace(/[^a-z0-9+#\/.&\s-]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!normalized) continue;
        if (/\d/.test(normalized)) continue;
        const words = normalized.split(/\s+/).filter(Boolean);
        if (!words.length) continue;
        if (words.length > 4) continue;
        if (VERB_PREFIXES.has(words[0])) continue;
        if (words.some((word) => BANNED_WORDS_ANYWHERE.has(word))) continue;
        if (words.every((word) => stopWords.has(word))) continue;
        token = token
          .replace(/^\d+(\.|-)?\s*/, "")
          .replace(/[.?!,:]+$/g, "")
          .trim();
        if (!/[a-z]/i.test(token)) continue;
        skills.push(token);
      }
    }

    return skills;
  }

  private dedupeSkills(skills: string[]) {
    const displayList: string[] = [];
    const normalizedSet = new Set<string>();

    for (const skill of skills) {
      const canonical = mapSkillSynonym(skill);
      const formatted = this.formatSkill(canonical);
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
    if (!skill) {
      return "";
    }
    const canonical = mapSkillSynonym(skill);
    return canonical
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





