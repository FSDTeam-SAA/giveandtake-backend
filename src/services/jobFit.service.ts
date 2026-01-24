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
  "partner",
  "work",
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
  "what",
  "etc",
  "similar",
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

    this.chatModel = new ChatGoogleGenerativeAI({
      apiKey,
      model: DEFAULT_CHAT_MODEL,
      temperature: 0.1,
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

    const aiResponse: FitAiResponse | null =
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

    const useAiSkillLists = !!aiResponse;
    const aiJobSkills: string[] = aiResponse?.jobSkills ?? [];
    const aiProfileSkills: string[] = aiResponse?.profileSkills ?? [];

    const jobSkillPool: string[] = useAiSkillLists
      ? aiJobSkills
      : [...aiJobSkills, ...heuristicJobSkills];

    const profileSkillPool: string[] = useAiSkillLists
      ? [...resumeSkillList, ...aiProfileSkills]
      : [...resumeSkillList, ...aiProfileSkills, ...heuristicProfileSkills];

    const [parsedJobSkills, parsedProfileSkills] = await Promise.all([
      this.dedupeSkills(jobSkillPool),
      this.dedupeSkills(profileSkillPool),
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

  // ==================== IMPROVED GEMINI PROMPT ====================

  private async callGemini(
    jobText: string,
    profileText: string
  ): Promise<FitAiResponse | null> {
    if (!this.aiEnabled || !jobText || !profileText) return null;
    if (!this.ensureChatModel() || !this.chatModel) return null;

    try {
      const systemPrompt = new SystemMessage(
        `You extract ONLY concrete technical skills. A skill is a specific technology, tool, or practice.

EXAMPLES OF VALID SKILLS:
React, Python, SQL, Git, AWS, Tableau, REST API, Agile, UI/UX Design, HTML, CSS, JavaScript, Vue, Angular, Node.js, TypeScript, Docker, Kubernetes, MongoDB

EXAMPLES OF INVALID (NEVER OUTPUT THESE):
- "Job Overview" (section header)
- "Qualifications" (section header)
- "Nice-to-have Skills" (meta text)
- "Strong Proficiency In HTML" (descriptive phrase - output "HTML" only)
- "Libraries Such As React" (sentence fragment - output "React" only)
- "High-performance Web Applications" (outcome, not a skill)
- "Backend Developers" (job role, not a skill)
- "Reusable Code" (quality descriptor, not a skill)
- "Scalability" (concept, not a skill)
- "UX Designs Into High-quality" (sentence fragment)
- "Bootstrap)" (has trailing punctuation)

STRICT RULES:
1. Extract ONLY the technology name: "Strong proficiency in HTML" → "HTML"
2. From "Libraries such as React, Vue" → output: "React", "Vue" (separately)
3. NO section headers (Overview, Qualifications, Requirements, Nice-to-have)
4. NO descriptive phrases (High-performance, Reusable, Strong proficiency)
5. NO role names (Developers, Engineers, Designers)
6. NO trailing punctuation: "Bootstrap)" → "Bootstrap"
7. Skills must be 1-3 words max
8. Limit to 10 most important skills per list

JSON format:
{"jobSkills":["React","Vue","HTML"],"profileSkills":["React","Node.js"],"matchedSkills":["React"],"missingSkills":["Vue","HTML"],"matchPercentage":33,"summary":"Brief fit summary"}`
      );

      const instruction = new HumanMessage(
        `JOB:\n${jobText}\n\nPROFILE:\n${profileText}\n\nExtract ONLY concrete skills. NO section headers, NO phrases, NO descriptions.`
      );

      console.log("[job-fit][gemini] request", {
        model: DEFAULT_CHAT_MODEL,
        systemPromptLength: systemPrompt.content.toString().length,
        jobTextLength: jobText.length,
        profileTextLength: profileText.length,
      });

      const completion = await this.chatModel.invoke([
        systemPrompt,
        instruction,
      ]);
      const raw = this.extractText(completion.content);
      console.log("[job-fit][gemini] raw response", { raw });
      if (!raw) return null;

      const parsed = this.parseAiJson(raw);
      console.log("[job-fit][gemini] parsed response", { parsed });
      return this.sanitizeAiLists(parsed);
    } catch (error) {
      console.warn(
        "[job-fit] Gemini comparison failed:",
        (error as Error).message
      );
      return null;
    }
  }

  // ==================== ENHANCED SANITIZATION ====================

  private sanitizeAiLists(resp: FitAiResponse | null): FitAiResponse | null {
    if (!resp) return resp;

    // NUCLEAR-LEVEL SANITIZATION
    const cleanSkill = (raw: string): string | null => {
      if (!raw) return null;
      
      let s = raw.trim()
        .replace(/^[`'"\u201c\u201d\u2018\u2019\u00b7\u2022-]+/, "")
        .replace(/[`'"\u201c\u201d\u2018\u2019\u00b7\u2022-]+$/, "")
        .replace(/[()}\]]+/g, "") // Remove ALL parentheses/brackets
        .replace(/[.?!,:;]+$/g, ""); // Remove trailing punctuation

      const lower = s.toLowerCase();

      // INSTANT REJECTION - These exact strings are NEVER skills
      const EXACT_BANS = new Set([
        "job overview", "overview", "qualifications", "responsibilities",
        "requirements", "nice-to-have", "nice to have", "nice-to-have skills",
        "preferred", "optional", "high-performance", "high performance",
        "scalability", "scalable", "reusable code", "reusable",
        "maintainable", "clean code", "backend developers", "frontend developers",
        "developers", "engineers", "designers", "team", "backend", "frontend",
        "ux designs into high-quality", "ux designs into", "designs into",
        "high-performance web applications", "web applications",
        "strong proficiency in html", "strong proficiency", "proficiency",
        "libraries such as react", "libraries such as", "such as",
        "experience with", "familiarity with", "knowledge of",
        "what you'll do", "you'll do", "you will", "we are looking",
      ]);

      if (EXACT_BANS.has(lower)) return null;

      // Extract skill from descriptive phrases
      // "Strong Proficiency In HTML" → "HTML"
      const proficiencyMatch = lower.match(/(?:strong|solid|good|excellent)\s+(?:proficiency|knowledge|experience)\s+(?:in|with)\s+(.+)/);
      if (proficiencyMatch) {
        s = proficiencyMatch[1].trim();
      }

      // "Libraries such as React" → "React"
      const suchAsMatch = lower.match(/(?:libraries|tools|frameworks?)\s+(?:such\s+as|like|including)\s+(.+)/);
      if (suchAsMatch) {
        s = suchAsMatch[1].trim();
      }

      // "UX designs into high-quality" → "UX Design"
      if (lower.includes("ux") && (lower.includes("designs") || lower.includes("design"))) {
        if (lower.includes("into") || lower.includes("high-quality")) {
          return "UI/UX Design";
        }
      }

      // Pattern-based rejection
      const BAD_PATTERNS = [
        /^(job|overview|qualifications?|responsibilit(y|ies)|requirements?)/i,
        /^(nice[-\s]?to[-\s]?have|preferred|optional)/i,
        /\b(high[-\s]?performance|scalab(le|ility))\b/i,
        /\b(developers?|engineers?|designers?|backend|frontend)\b/i,
        /\b(reusable|maintainable|clean)\s+(code|applications?)\b/i,
        /^(strong|solid|good)\s/i, // Still starts with descriptors
        /\b(you'?ll|you\s+will|we'?re|we\s+are)\b/i,
        /\binto\s+(high|quality)/i,
        /\b(such\s+as|including|like)\b/i, // Still contains meta phrases
      ];

      if (BAD_PATTERNS.some(p => p.test(s))) return null;

      const words = s.toLowerCase().split(/\s+/).filter(Boolean);
      
      // Length validation
      if (words.length === 0 || words.length > 3) return null;

      // Stopword validation
      const stopwords = new Set([
        "and", "or", "of", "off", "with", "the", "to", "for", "in", "a", "an",
        "you", "will", "such", "as", "like", "into", "high", "quality",
      ]);

      if (stopwords.has(words[0]) || stopwords.has(words[words.length - 1])) {
        return null;
      }

      // Generic non-skill terms
      if (words.length === 1) {
        const genericTerms = new Set([
          "scalability", "performance", "reusable", "maintainable", "applications",
          "proficiency", "qualifications", "overview", "responsibilities",
          "requirements", "developers", "engineers", "code", "quality",
        ]);
        if (genericTerms.has(words[0])) return null;
      }

      // Must have alphanumeric
      if (!/[a-z0-9]/i.test(s)) return null;

      return s;
    };

    const normalizeSkill = (s: string): string => {
      const lower = s.toLowerCase().trim();
      
      // Common normalizations
      const MAP: Record<string, string> = {
        "html5": "HTML",
        "css3": "CSS",
        "javascript": "JavaScript",
        "js": "JavaScript",
        "es6": "JavaScript",
        "es2015": "JavaScript",
        "reactjs": "React",
        "react.js": "React",
        "vuejs": "Vue",
        "vue.js": "Vue",
        "angularjs": "AngularJS", // Keep distinct from Angular
        "nodejs": "Node.js",
        "node": "Node.js",
        "typescript": "TypeScript",
        "ts": "TypeScript",
        "nextjs": "Next.js",
        "next": "Next.js",
        "nuxtjs": "Nuxt.js",
        "nuxt": "Nuxt.js",
        "github": "Git",
        "gitlab": "Git",
        "bitbucket": "Git",
        "bootstrap": "Bootstrap",
        "bootstrap 5": "Bootstrap",
        "scss": "SASS",
        "sass": "SASS",
        "tailwindcss": "Tailwind",
        "tailwind css": "Tailwind",
        "rest api": "REST API",
        "rest apis": "REST API",
        "restful api": "REST API",
        "graphql api": "GraphQL",
        "ux design": "UI/UX Design",
        "ui/ux": "UI/UX Design",
        "ui ux": "UI/UX Design",
        "row-level security": "Row-Level Security",
        "power query": "Power Query",
        "powerquery": "Power Query",
        "power bi": "Power BI",
        "powerbi": "Power BI",
        "dax": "DAX",
        "ms excel": "Excel",
        "microsoft excel": "Excel",
        "wcag": "WCAG",
        "wcag 2.1": "WCAG",
      };

      return MAP[lower] || s;
    };

    const formatSkill = (skill: string): string => {
      const trimmed = skill.trim();
      if (!trimmed) return "";
      if (trimmed.length <= 4) return trimmed.toUpperCase();
      return trimmed
        .split(" ")
        .map((word) =>
          word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""
        )
        .join(" ")
        .trim();
    };

    const processSkillList = (arr?: string[]): string[] => {
      if (!arr || !Array.isArray(arr)) return [];
      
      const result: string[] = [];
      const seen = new Set<string>();

      for (const item of arr) {
        if (!item || typeof item !== 'string') continue;

        // Split by common separators
        const pieces = item
          .split(/[,;|&+]|\s+and\s+|\s+or\s+/i)
          .map(p => p.trim())
          .filter(Boolean);

        for (const piece of pieces) {
          const cleaned = cleanSkill(piece);
          if (!cleaned) continue;

          const normalized = normalizeSkill(cleaned);
          const formatted = formatSkill(normalized);
          const key = formatted.toLowerCase();

          if (key && !seen.has(key) && result.length < 10) {
            seen.add(key);
            result.push(formatted);
          }
        }
      }

      return result;
    };

    // Process all skill arrays
    resp.jobSkills = processSkillList(resp.jobSkills);
    resp.profileSkills = processSkillList(resp.profileSkills);

    // Recompute matched/missing based on cleaned lists
    const profileNormalized = new Set(
      resp.profileSkills.map(s => s.toLowerCase())
    );
    const jobNormalized = new Set(
      resp.jobSkills.map(s => s.toLowerCase())
    );

    resp.matchedSkills = resp.jobSkills.filter(skill =>
      profileNormalized.has(skill.toLowerCase())
    );

    resp.missingSkills = resp.jobSkills.filter(
      skill => !profileNormalized.has(skill.toLowerCase())
    );

    // Recalculate percentage
    if (typeof resp.matchPercentage !== "number" || isNaN(resp.matchPercentage)) {
      resp.matchPercentage = resp.jobSkills.length > 0
        ? (resp.matchedSkills.length / resp.jobSkills.length) * 100
        : 0;
    }
    resp.matchPercentage = this.safeScore(resp.matchPercentage);

    // Validate summary
    if (typeof resp.summary !== "string" || !resp.summary.trim()) {
      resp.summary = this.buildDefaultSummary(
        resp.matchedSkills.length,
        resp.jobSkills.length
      );
    }

    console.log("[job-fit][sanitized]", {
      jobSkills: resp.jobSkills,
      profileSkills: resp.profileSkills,
      matchedSkills: resp.matchedSkills,
      missingSkills: resp.missingSkills,
    });

    return resp;
  }

  // ---------------- heuristic helpers (unchanged) ----------------

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
      "and", "or", "of", "off", "with", "the", "to", "for", "in", "a", "an",
      "is", "are", "be", "being", "been", "at", "on", "by", "per", "via",
      "our", "your", "skills", "ability", "work", "preferred",
      "responsibilities", "requirements", "you", "will", "other", "others",
      "area", "areas", "similar", "etc", "what"
    ]);

    const edgeStopWords = new Set([
      "and", "or", "with", "the", "to", "for", "in", "of", "off", "a", "an",
      "is", "are", "our", "your", "you", "will"
    ]);

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

        const normalized = token
          .toLowerCase()
          .replace(/[^a-z0-9+#\/.&\s-]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        if (!normalized) continue;
        if (/^[0-9\s\-/.]+$/.test(normalized)) continue;

        const words = normalized.split(/\s+/).filter(Boolean);
        if (!words.length) continue;
        if (words.length > 4) continue;
        if (VERB_PREFIXES.has(words[0])) continue;
        if (
          edgeStopWords.has(words[0]) ||
          edgeStopWords.has(words[words.length - 1])
        )
          continue;
        if (words.some((word) => BANNED_WORDS_ANYWHERE.has(word))) continue;
        if (words.every((word) => stopWords.has(word))) continue;

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
        word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""
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
    if (!totalRequired)
      return "Not enough job data to calculate a skill match.";
    return `Matched ${matched} of ${totalRequired} highlighted requirements.`;
  }
}

export const jobFitService = new JobFitService();
