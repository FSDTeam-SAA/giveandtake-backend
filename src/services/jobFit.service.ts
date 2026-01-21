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
  process.env.GEMINI_CHAT_MODEL ?? "gemini-3-flash-preview";

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
  "roles",
  "duties",
  "requirements",
  "you",
  "will",
  "other",
  "others",
  "area",
  "areas",
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

type EvaluateOptions = {
  useAi?: boolean;
  useEmbeddings?: boolean;
  jobEmbedding?: number[] | null;
  profileEmbedding?: number[] | null;
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
    this.chatModel = new ChatGoogleGenerativeAI({
      apiKey,
      model: DEFAULT_CHAT_MODEL,
      temperature: 0.2,
      // maxOutputTokens: 2048,
      // generationConfig: { responseMimeType: "application/json" },
    });

    return true;
  }

  async evaluate(
    payload: EvaluatePayload,
    options: EvaluateOptions = {}
  ): Promise<JobFitSummary> {
    const allowAi = options.useAi ?? this.aiEnabled;
    const allowEmbeddings = options.useEmbeddings ?? true;
    const jobText = buildJobText(payload.job);
    const profileText = buildProfileText(
      payload.resume,
      payload.experiences,
      payload.education
    );

    const aiResponse =
      allowAi && this.aiEnabled
        ? await this.callGemini(jobText, profileText)
        : null;

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
    let jobEmbedding = options.jobEmbedding ?? null;
    let profileEmbedding = options.profileEmbedding ?? null;

    if (allowEmbeddings && areEmbeddingsEnabled()) {
      if (!jobEmbedding) {
        jobEmbedding = await generateJobEmbeddingVector(payload.job);
      }
      if (!profileEmbedding) {
        profileEmbedding = await generateProfileEmbeddingVector(
          payload.resume,
          payload.experiences,
          payload.education
        );
      }

      if (jobEmbedding && profileEmbedding) {
        const similarity = cosineSimilarity(jobEmbedding, profileEmbedding);
        if (similarity > 0) {
          embeddingScore = this.safeScore(similarity * 100);
        }
      }
    }

    const weightedScores = [{ value: heuristicScore, weight: 0.5 }];

    if (embeddingScore !== null) {
      weightedScores.push({ value: embeddingScore, weight: 0.3 });
    }

    if (
      allowAi &&
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
        allowAi && this.chatModel
          ? DEFAULT_CHAT_MODEL
          : allowEmbeddings && embeddingScore !== null
          ? "heuristic+GeminiEmb"
          : "heuristic",
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
          "You are a job-to-profile SKILL extractor and matcher.",
          "A SKILL is a concrete, reusable competency that could appear on a resume skill section:",
          "- technologies (React, Vue, Next.js),",
          "- APIs/standards (REST APIs),",
          "- tooling (Git),",
          "- methods/practices (Responsive Design, Web Performance),",
          "- certifications/licenses (ISO 9001, FAA Part 107),",
          "- soft skills (Communication).",
          "",
          "NOT skills:",
          "- section headers or meta text (Job Overview, Qualifications, Responsibilities, Nice-to-have, About the role),",
          "- people/roles/teams (Backend Developers),",
          "- outcomes/goals/claims (High-performance Web Applications, Scalable solutions),",
          "- sentence fragments, verb phrases, or anything starting with conjunctions (And Performance),",
          "- long phrases > 3 words unless it is a known skill phrase (e.g., 'REST APIs', 'Responsive Design', 'Web Performance', 'UI/UX Design', 'Project Management').",
          "",
          "Output STRICT JSON ONLY with keys (in this order):",
          '{"jobSkills":[],"profileSkills":[],"matchedSkills":[],"missingSkills":[],"matchPercentage":0,"summary":""}',
          "",
          "Extraction rules:",
          "- Extract atomic skills (1-3 words). No sentences. No verbs/responsibilities.",
          "- If text describes UX/UI handoff or translating designs into code, normalize to 'UI/UX Design'.",
          "- Canonicalize common families:",
          "  HTML5 -> HTML; CSS3 -> CSS; ES6/ES2015 -> JavaScript; ReactJS -> React; Node/NodeJS -> Node.js; TS -> TypeScript;",
          "  GitHub/GitLab/Bitbucket -> Git; AdWords/Google AdWords -> Google Ads; Facebook Ads/Meta Ads -> Meta Ads;",
          "  MS Excel -> Excel; Office Suite -> Microsoft Office; EMR/EHR -> EHR; Good Manufacturing Practice -> GMP.",
          "- Keep major differences distinct (AngularJS vs Angular; CPR vs BLS vs ACLS; Python 2 vs Python 3).",
          "",
          "Filtering rules (IMPORTANT):",
          "- If a candidate is uncertain or looks like a clause/fragment, DROP it.",
          "- Do NOT include generic fillers like 'Scalability', 'Reusable Code', 'Performance' unless explicitly stated as a practice like 'Web Performance'.",
          "- Never include 'and', '/', '&', '+', ',' as skills.",
          "",
          "Final output rules:",
          "- jobSkills: ONLY explicit or strongly implied requirements from JOB.",
          "- profileSkills: ONLY skills evidenced in PROFILE.",
          "- matchedSkills/missingSkills MUST be computed from the final canonicalized lists only.",
          "- missingSkills must be a subset of jobSkills.",
          "- Limit jobSkills and profileSkills to at most 12 items each.",
          "- matchPercentage is 0-100 number.",
          "- summary <= 40 words, neutral tone.",
          "- No markdown, no comments, no extra keys."
        ].join("\n")
      );

      const instruction = new HumanMessage(
        [
          "TASK: Extract skills from JOB and PROFILE, then filter to VALID SKILLS only, then match.",
          "",
          "JOB_TEXT:",
          jobText,
          "",
          "PROFILE_TEXT:",
          profileText,
        ].join("\n")
      );

      console.log("[job-fit][gemini] request", {
        model: DEFAULT_CHAT_MODEL,
        jobText,
        profileText,
        systemPrompt: systemPrompt.content,
        instruction: instruction.content,
      });

      const completion = await this.chatModel.invoke([systemPrompt, instruction]);
      const raw = this.extractText(completion.content);
      console.log("[job-fit][gemini] raw response", { raw });
      if (!raw) return null;

      const parsed = this.parseAiJson(raw);
      console.log("[job-fit][gemini] parsed response", { parsed });
      return this.sanitizeAiLists(parsed);
    } catch (error) {
      console.warn("[job-fit] Gemini comparison failed:", (error as Error).message);
      return null;
    }
  }

  private sanitizeAiLists(resp: FitAiResponse | null): FitAiResponse | null {
    if (!resp) return resp;

    const stripEdgePunctuation = (value: string) =>
      value
        .replace(/^[`'"\u201c\u201d\u2018\u2019\u00b7\u2022-]+/, "")
        .replace(/[`'"\u201c\u201d\u2018\u2019\u00b7\u2022-]+$/, "");

    const SEP = /(?:\s+and\s+|\/|&|,|\u00fa|\u0007|\||;|\+)+/i;
    const BAD = new Set([
      "and",
      "or",
      "with",
      "the",
      "you",
      "will",
      "other",
      "others",
      "area",
      "areas",
      "is",
      "are",
    ]);
    const BAD_PATTERNS = [
      /\b(job\s+overview|overview|qualifications?|responsibilit(y|ies)|requirements?)\b/i,
      /\b(nice[-\s]?to[-\s]?have|preferred)\b/i,
      /\b(developers?|engineers?|designers?|backend|front\s*end|team)\b/i,
      /\b(high[-\s]?performance|scalab(le|ility)|reusable\s+code)\b/i,
      /\b(functional(ly)?\s+correct(ness)?|factual\s+correctness|code\s+functionality)\b/i,
      /^(and|or)\b/i,
    ];
    const ALLOW_PHRASES = new Set([
      "rest apis",
      "responsive design",
      "web performance",
      "ui/ux design",
      "unit testing",
      "api design",
      "project management",
    ]);

    const EDGE_STOPWORDS = new Set([
      "and",
      "or",
      "with",
      "the",
      "to",
      "for",
      "in",
      "of",
      "a",
      "an",
      "your",
      "our",
      "is",
      "are",
    ]);

    const looksSentenceLike = (s: string) => {
      if (/[()]/.test(s)) return true;
      if (/\binto\b|\bto\b|\bfor\b|\bwith\b/i.test(s)) return true;
      return false;
    };

    const isValidSkill = (raw: string) => {
      const s = raw.trim();
      if (!s) return false;

      const lower = s.toLowerCase();
      if (BAD_PATTERNS.some((p) => p.test(lower))) return false;

      const words = lower.replace(/[-/]/g, " ").split(/\s+/).filter(Boolean);
      if (words.length === 0) return false;
      if (ALLOW_PHRASES.has(lower)) return true;
      if (words.length > 3) return false;
      if (looksSentenceLike(s)) return false;
      if (words.length === 1 && ["performance", "scalability", "applications"].includes(words[0])) {
        return false;
      }
      if (EDGE_STOPWORDS.has(words[0]) || EDGE_STOPWORDS.has(words[words.length - 1])) {
        return false;
      }

      return true;
    };

    const normalizeFamily = (p: string): string => {
      const lower = p.toLowerCase();
      if (
        lower.includes("ui/ux") ||
        lower.includes("ui ux") ||
        lower.includes("ux design")
      ) {
        return "UI/UX Design";
      }
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
            stripEdgePunctuation(
              this.formatSkill(
                s
                  .replace(/[.?!,:]+$/g, "")
                  .trim()
              )
            )
          )
          .filter((s) => s && !BAD.has(s.toLowerCase()));

        for (let p of pieces) {
          const lower = p.toLowerCase();
          const words = lower
            .replace(/[-/]/g, " ")
            .replace(/['’]/g, "")
            .split(/\s+/)
            .filter(Boolean);
          if (!words.length || BAD.has(words[0]) || words.length > 3) {
            continue;
          }
          if (EDGE_STOPWORDS.has(words[0]) || EDGE_STOPWORDS.has(words[words.length - 1])) {
            continue;
          }

          if (!isValidSkill(p)) {
            continue;
          }

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
    const cleanedMatched = cleanList(resp.matchedSkills);
    const cleanedMissing = cleanList(resp.missingSkills);

    if (typeof resp.matchPercentage !== "number" || isNaN(resp.matchPercentage)) {
      resp.matchPercentage = 0;
    } else {
      resp.matchPercentage = this.safeScore(resp.matchPercentage);
    }

    if (typeof resp.summary !== "string") resp.summary = "";

    // Recompute matched/missing to enforce subset logic.
    const profileSet = new Set(resp.profileSkills.map((s) => this.normalizeSkill(s)));
    const jobSet = new Set(resp.jobSkills.map((s) => this.normalizeSkill(s)));
    resp.matchedSkills = resp.jobSkills.filter((skill) =>
      profileSet.has(this.normalizeSkill(skill))
    );
    resp.missingSkills = resp.jobSkills.filter(
      (skill) => !profileSet.has(this.normalizeSkill(skill))
    );

    // Preserve any valid AI-provided items that fit subsets without duplicating.
    for (const m of cleanedMatched) {
      if (!this.normalizeSkill(m)) continue;
      if (jobSet.has(this.normalizeSkill(m)) && profileSet.has(this.normalizeSkill(m))) {
        if (!resp.matchedSkills.find((x) => this.normalizeSkill(x) === this.normalizeSkill(m))) {
          resp.matchedSkills.push(m);
        }
      }
    }
    for (const m of cleanedMissing) {
      if (!this.normalizeSkill(m)) continue;
      if (jobSet.has(this.normalizeSkill(m)) && !profileSet.has(this.normalizeSkill(m))) {
        if (!resp.missingSkills.find((x) => this.normalizeSkill(x) === this.normalizeSkill(m))) {
          resp.missingSkills.push(m);
        }
      }
    }

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

    const stripEdge = (value: string) =>
      value
        .replace(/^\d+(\.|-)?\s*/, "")
        .replace(/^[`'"\u201c\u201d\u2018\u2019\u00b7\u2022-]+/, "")
        .replace(/[.?!,:]+$/g, "")
        .replace(/[`'"\u201c\u201d\u2018\u2019\u00b7\u2022-]+$/, "")
        .trim();

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
      "is",
      "are",
      "be",
      "being",
      "been",
      "at",
      "on",
      "by",
      "per",
      "via",
      "our",
      "your",
      "skills",
      "ability",
      "work",
      "preferred",
      "responsibilities",
      "requirements",
      "you",
      "will",
      "other",
      "others",
      "area",
      "areas",
      "similar",
    ]);

    const edgeStopWords = new Set([
      "and",
      "or",
      "with",
      "the",
      "to",
      "for",
      "in",
      "of",
      "a",
      "an",
      "is",
      "are",
      "our",
      "your",
    ]);

    const bannedPhrases = [
      /\b(functional(ly)?\s+correct(ness)?|factual\s+correctness|code\s+functionality)\b/i,
      /\b(functionality|functionally|correctness)\b/i,
    ];

    const skills: string[] = [];

    for (const chunk of accumulator) {
      if (!chunk) continue;
      const normalizedChunk = chunk.replace(/\. (?=[A-Z])/g, "\n");
      const tokens = normalizedChunk
        .split(/[\n\r,;|\/+&\u2022]+/g)
        .map(stripEdge)
        .filter((token) => token.length > 1 && token.length <= 45);

      for (const rawToken of tokens) {
        const token = rawToken;
        if (!token) continue;

        // Keep alphanumerics (to allow ISO 9001, FAA Part 107, A320, etc.)
        const normalized = token
          .toLowerCase()
          .replace(/[^a-z0-9+#\/.&\s-]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        if (!normalized) continue;
        if (bannedPhrases.some((pattern) => pattern.test(normalized))) continue;

        // Skip items that are purely numeric or punctuation-like
        if (/^[0-9\s\-/.]+$/.test(normalized)) continue;

        const words = normalized.split(/\s+/).filter(Boolean);
        if (!words.length) continue;
        if (words.length > 4) continue;
        if (VERB_PREFIXES.has(words[0])) continue;
        if (edgeStopWords.has(words[0]) || edgeStopWords.has(words[words.length - 1])) continue;
        if (words.some((word) => BANNED_WORDS_ANYWHERE.has(word))) continue;
        if (words.every((word) => stopWords.has(word))) continue;

        const normalizedPhrase = words.join(" ");
        if (
          normalizedPhrase.startsWith("you will") ||
          normalizedPhrase.startsWith("will") ||
          normalizedPhrase.includes("other area")
        ) {
          continue;
        }

        if (
          words.length === 1 &&
          ["functionality", "functionally", "correctness", "correct", "factual"].includes(
            words[0]
          )
        ) {
          continue;
        }

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


