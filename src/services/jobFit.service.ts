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
import {
  mapSkillSynonym,
  mapSkillSynonymSmart,
} from "./skillMapper.service";
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
  "manage",
  "lead",
  "coordinate",
  "assist",
  "support",
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
  "experience",
  "role",
  "duties",
  "requirements",
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
    if (!this.aiEnabled) return false;
    if (this.chatModel) return true;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[job-fit] GEMINI_API_KEY missing; falling back to heuristic+embedding mode."
      );
      this.aiEnabled = false;
      return false;
    }

    // Optional generationConfig: some LangChain versions pass this through.
    // Safe to keep; ignored if unsupported.
    // @ts-ignore
    this.chatModel = new ChatGoogleGenerativeAI({
      apiKey,
      model: DEFAULT_CHAT_MODEL,
      temperature: 0.2,
      maxOutputTokens: 512,
      // generationConfig: { responseMimeType: "application/json" },
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

    const [parsedJobSkills, parsedProfileSkills] = await Promise.all([
      this.dedupeSkills([
        ...(aiResponse?.jobSkills ?? []),
        ...heuristicJobSkills,
      ]),
      this.dedupeSkills([
        ...resumeSkillList,
        ...(aiResponse?.profileSkills ?? []),
        ...heuristicProfileSkills,
      ]),
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

    if (this.aiEnabled && typeof aiResponse?.matchPercentage === "number") {
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
      weightedScores.reduce((sum, item) => sum + item.value * item.weight, 0) /
        totalWeight
    );

    const verdict =
      SCORE_LABELS.find((label) => score >= label.min && score < label.max) ??
      SCORE_LABELS[0];

    const aiSummary =
      aiResponse?.summary ??
      this.buildDefaultSummary(
        matchedSkills.length,
        parsedJobSkills.list.length
      );

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
      model:
        this.aiEnabled && this.chatModel ? DEFAULT_CHAT_MODEL : "heuristic+GeminiEmb",
    };
  }

  // ---------- NEW: compact, cross-industry prompt + sanitizer ----------

  private async callGemini(
    jobText: string,
    profileText: string
  ): Promise<FitAiResponse | null> {
    if (!this.aiEnabled || !jobText || !profileText) return null;
    if (!this.ensureChatModel() || !this.chatModel) return null;

    try {
      const systemPrompt = new SystemMessage(
        [
          "You are a cross-industry job↔profile skill matcher (tech and non-tech).",
          'Return STRICT JSON ONLY with keys (in this order): {"jobSkills":[],"profileSkills":[],"matchedSkills":[],"missingSkills":[],"matchPercentage":0,"summary":""}',
          "Extract atomic skills (1–3 words): tools, methods, certifications, licenses, platforms, soft skills (e.g., Communication). No verbs/responsibilities/sentences.",
          "Canonicalize families unless materially different:",
          "  HTML5→HTML; CSS3→CSS; ES6/ES2015→JavaScript; Node/NodeJS→Node.js; ReactJS→React; TS→TypeScript;",
          "  GitHub/GitLab/Bitbucket→Git; AdWords/Google AdWords→Google Ads; Facebook Ads/Meta Ads→Meta Ads;",
          "  MS Excel→Excel; MS Word→Word; Office Suite→Microsoft Office; EMR/EHR→EHR;",
          "  GMP/Good Manufacturing Practice→GMP; HACCP stays HACCP; ISO 9001 stays ISO 9001; FAA Part 107 stays FAA Part 107.",
          "Keep distinct MAJOR differences (Python 2 vs 3; AngularJS vs Angular; CPR vs BLS vs ACLS).",
          "Cleanup: split on 'and', '/', '&', '+', ',', '•', '|', ';'. Never output these as skills. No trailing punctuation. Deduplicate case-insensitively after canonicalization.",
          "Format: Title Case words; use UPPERCASE for ≤4-char acronyms (SQL, AWS, EHR, GMP, ISO, CPR, BLS, ACLS).",
          "Matching is computed AFTER canonicalization (treat HTML==HTML5, CSS==CSS3, Git==GitHub/GitLab/Bitbucket, etc.).",
          "Limit jobSkills and profileSkills to ≤12 each (most relevant). matchPercentage = 0–100 (number). summary ≤40 words, neutral.",
          "No markdown, no comments, no extra keys."
        ].join("\n")
      );

      const instruction = new HumanMessage(
        ["JOB:", jobText, "", "PROFILE:", profileText].join("\n")
      );

      const completion = await this.chatModel.invoke([systemPrompt, instruction]);
      const raw = this.extractText(completion.content);
      if (!raw) return null;

      const parsed = this.parseAiJson(raw);
      return this.sanitizeAiLists(parsed);
    } catch (error) {
      console.warn("[job-fit] Gemini comparison failed:", (error as Error).message);
      return null;
    }
  }

  private sanitizeAiLists(resp: FitAiResponse | null): FitAiResponse | null {
    if (!resp) return resp;

    const SEP = /(?:\s+and\s+|\/|&|,|·|•|\||;|\+)+/i;
    const BAD = new Set(["and", "or", "with", "the"]);

    const normalizeFamily = (p: string): string => {
      const lower = p.toLowerCase();
      if (lower === "html5") return "HTML";
      if (lower === "css3") return "CSS";
      if (["github", "gitlab", "bitbucket"].includes(lower)) return "Git";
      if (["adwords", "google adwords"].includes(lower)) return "Google Ads";
      if (["facebook ads", "meta ads"].includes(lower)) return "Meta Ads";
      if (lower === "ms excel") return "Excel";
      if (lower === "ms word") return "Word";
      if (["office suite", "microsoft office"].includes(lower))
        return "Microsoft Office";
      if (["emr", "ehr"].includes(lower)) return "EHR";
      if (["good manufacturing practice"].includes(lower)) return "GMP";
      return p;
    };

    const cleanList = (arr?: string[]) => {
      if (!arr) return [];
      const out: string[] = [];
      const seen = new Set<string>();
      for (const item of arr) {
        if (!item) continue;
        const pieces = String(item)
          .split(SEP)
          .map((s) =>
            this.formatSkill(
              s
                .replace(/[.?!,:]+$/g, "")
                .trim()
            )
          )
          .filter((s) => s && !BAD.has(s.toLowerCase()));

        for (let p of pieces) {
          p = normalizeFamily(p);
          const key = this.normalizeSkill(p);
          if (key && !seen.has(key)) {
            seen.add(key);
            out.push(p);
          }
        }
      }
      return out.slice(0, 12);
    };

    resp.jobSkills = cleanList(resp.jobSkills);
    resp.profileSkills = cleanList(resp.profileSkills);
    resp.matchedSkills = cleanList(resp.matchedSkills);
    resp.missingSkills = cleanList(resp.missingSkills);

    if (typeof resp.matchPercentage !== "number" || isNaN(resp.matchPercentage)) {
      resp.matchPercentage = 0;
    } else {
      resp.matchPercentage = this.safeScore(resp.matchPercentage);
    }

    if (typeof resp.summary !== "string") resp.summary = "";

    return resp;
  }

  // ---------------- heuristic helpers ----------------

  private extractHeuristicSkills(sources: WeightedSkillSource[]): string[] {
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
      if (sanitized) accumulator.push(sanitized);
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
      "responsibilities",
      "requirements",
    ]);

    const skills: string[] = [];

    for (const chunk of accumulator) {
      if (!chunk) continue;
      const normalizedChunk = chunk.replace(/\. (?=[A-Z])/g, "\n");
      const tokens = normalizedChunk
        .split(/[\n\r,;•\u2022|/+&]+/g)
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

        // Keep alphanumerics (to allow ISO 9001, FAA Part 107, A320, etc.)
        const normalized = token
          .toLowerCase()
          .replace(/[^a-z0-9+#\/.&\s-]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        if (!normalized) continue;

        // Skip items that are purely numeric or punctuation-like
        if (/^[0-9\s\-/.]+$/.test(normalized)) continue;

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
        if (!/[a-z]/i.test(token) && !/[0-9]/.test(token)) continue;

        skills.push(token);
      }
    }

    return skills;
  }

  private async dedupeSkills(skills: string[]) {
    const displayList: string[] = [];
    const normalizedSet = new Set<string>();

    for (const skill of skills) {
      if (!skill) continue;
      const canonical = await mapSkillSynonymSmart(skill);
      const normalized = this.normalizeCanonicalSkill(canonical);
      if (!normalized || normalizedSet.has(normalized)) continue;

      normalizedSet.add(normalized);
      displayList.push(this.formatSkill(canonical));
      if (displayList.length >= 25) break;
    }

    return {
      list: displayList,
      set: normalizedSet,
    };
  }

  private normalizeSkill(skill: string): string {
    if (!skill) return "";
    const canonical = mapSkillSynonym(skill);
    return this.normalizeCanonicalSkill(canonical);
  }

  private normalizeCanonicalSkill(skill: string): string {
    return skill
      .toLowerCase()
      .replace(/[^a-z0-9+#/.&\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private formatSkill(skill: string): string {
    const trimmed = skill.trim();
    if (!trimmed) return "";
    if (trimmed.length <= 4) return trimmed.toUpperCase();
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
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
      const parsed = JSON.parse(clean) as FitAiResponse;
      return parsed;
    } catch {
      console.warn("[job-fit] Failed to parse AI JSON:", clean);
      return null;
    }
  }

  private extractText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === "string"
            ? part
            : typeof (part as any)?.text === "string"
            ? (part as any).text
            : ""
        )
        .join("");
    }
    if (content && typeof content === "object" && "text" in (content as any)) {
      return String((content as { text?: string }).text ?? "");
    }
    return "";
  }

  private safeScore(score: number | undefined | null): number {
    if (typeof score !== "number" || Number.isNaN(score)) return 0;
    return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
  }

  private buildDefaultSummary(matched: number, totalRequired: number): string {
    if (!totalRequired) return "Not enough job data to calculate a skill match.";
    return `Matched ${matched} of ${totalRequired} highlighted requirements.`;
  }
}

export const jobFitService = new JobFitService();
