import {
  areEmbeddingsEnabled,
  cosineSimilarity,
  generateTextEmbedding,
} from "./embedding.service";

export type SynonymConfig = Record<string, string[]>;

type FuzzyCandidate = {
  canonical: string;
  score: number;
};

type SkillResolution = {
  canonical: string;
  normalized: string;
  matched: boolean;
  candidates: FuzzyCandidate[];
};

type CanonicalMetadata = {
  normalized: string;
  vector: Map<string, number>;
};

// ---- Tuning ----
const FUZZY_STRICT_THRESHOLD = 0.92;
const FUZZY_SEMANTIC_MIN = 0.68;
const SEMANTIC_SCORE_THRESHOLD = 0.82;
const MAX_FUZZY_CANDIDATES = 8;

// ---- Stores & caches ----
const canonicalSkillSet = new Set<string>();
const canonicalMetadata = new Map<string, CanonicalMetadata>();
const synonymLookup = new Map<string, string>();
const resolutionCache = new Map<string, SkillResolution>();
const semanticResolutionCache = new Map<string, string>();
const embeddingVectorCache = new Map<string, number[]>();
const embeddingPromiseCache = new Map<string, Promise<number[] | null>>();

// Keep +/#/./& (C++, C#, .NET, R&D). Split &, - , /, | for lookup.
const normalizeKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\u00A0/g, " ")
    .replace(/[(),°’'`"]/g, " ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/[-/|]+/g, " ")
    .replace(/[^a-z0-9+#/.&\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function buildBigramVector(value: string): Map<string, number> {
  const vec = new Map<string, number>();
  if (!value) return vec;
  const padded = ` ${value} `;
  for (let i = 0; i < padded.length - 1; i += 1) {
    const gram = padded.slice(i, i + 2);
    vec.set(gram, (vec.get(gram) ?? 0) + 1);
  }
  return vec;
}

function cosineFromMaps(
  left: Map<string, number>,
  right: Map<string, number>
): number {
  if (!left.size || !right.size) return 0;

  // Dot uses smaller set; norms use full sets.
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];

  let dot = 0;
  let normLeft = 0;
  let normRight = 0;

  for (const v of left.values()) normLeft += v * v;
  for (const v of right.values()) normRight += v * v;
  if (!normLeft || !normRight) return 0;

  for (const [g, w] of smaller.entries()) {
    const other = larger.get(g);
    if (other) dot += w * other;
  }
  if (!dot) return 0;
  return dot / Math.sqrt(normLeft * normRight);
}

function registerCanonical(rawCanonical: string) {
  const canonical = rawCanonical.trim();
  if (!canonical) return;

  if (!canonicalSkillSet.has(canonical)) {
    canonicalSkillSet.add(canonical);
  }

  if (!canonicalMetadata.has(canonical)) {
    const normalized = normalizeKey(canonical);
    canonicalMetadata.set(canonical, {
      normalized,
      vector: buildBigramVector(normalized),
    });
  }

  const normalized = canonicalMetadata.get(canonical)!.normalized;
  if (normalized && !synonymLookup.has(normalized)) {
    synonymLookup.set(normalized, canonical);
  }
}

function registerSynonymPair(variant: string, canonical: string) {
  const normalized = normalizeKey(variant);
  if (!normalized) return;
  registerCanonical(canonical);
  synonymLookup.set(normalized, canonical);
}

function registerSynonyms(config: SynonymConfig) {
  for (const [canonical, variants] of Object.entries(config)) {
    registerCanonical(canonical);
    for (const variant of variants) registerSynonymPair(variant, canonical);
  }
}

// ------------------ CROSS-INDUSTRY SYNONYMS ------------------
// Keep this compact but broad. Vendor suites are flattened where reasonable.
// Distinct tools (e.g., GitHub Actions) are preserved.
const BASE_SYNONYMS: SynonymConfig = {
  // --- Web/Software core families ---
  HTML: ["html", "html5", "html 5"],
  CSS: ["css", "css3", "css 3"],
  JavaScript: ["javascript", "js", "java script", "vanilla js", "es6", "es 6", "es2015", "es 2015"],
  TypeScript: ["typescript", "ts", "type script"],
  "Node.js": ["node", "nodejs", "node js"],
  React: ["react", "reactjs", "react.js", "react js"],
  "React Native": ["react native", "rn", "reactnative", "react-native"],
  Vue: ["vue", "vuejs", "vue js", "vue.js"],
  Angular: ["angular", "angular 2+", "angular2+"],
  AngularJS: ["angularjs", "angular js"],
  "Next.js": ["next", "nextjs", "next js"],
  Express: ["express", "expressjs", "express js"],
  Python: ["python"],
  "Python 3": ["python 3", "python3"],
  "Python 2": ["python 2", "python2"],
  Java: ["java"],
  "C#": ["c#", "c sharp", "csharp"],
  "C++": ["c++", "cpp", "c plus plus"],
  ".NET": [".net", "dotnet"],

  // --- Dev tooling / Cloud ---
  Git: ["git", "github", "git hub", "gitlab", "git lab", "bitbucket"],
  "GitHub Actions": ["github actions", "gh actions"],
  "GitLab CI": ["gitlab ci", "gitlab ci cd", "gitlab ci/cd"],
  "Bitbucket Pipelines": ["bitbucket pipelines"],
  Docker: ["docker"],
  Kubernetes: ["k8s", "kubernetes"],
  Terraform: ["terraform"],
  Jenkins: ["jenkins"],
  AWS: ["aws", "amazon web services", "aws cloud"],
  Azure: ["azure", "microsoft azure", "azure cloud", "az-900"],
  "Google Cloud Platform": ["google cloud", "google cloud platform", "google cloud services"],
  GCP: ["gcp", "good clinical practice"], // ambiguous by design; see note below

  // --- Data / Analytics ---
  SQL: ["sql", "structured query language"],
  "PostgreSQL": ["postgres", "postgresql"],
  "MySQL": ["mysql"],
  MongoDB: ["mongo", "mongodb", "mongodb atlas"],
  Redis: ["redis"],
  Snowflake: ["snowflake"],
  BigQuery: ["bigquery", "google bigquery"],
  "Power BI": ["powerbi", "power bi"],
  Tableau: ["tableau"],
  "Looker Studio": ["looker studio", "google data studio", "data studio"],
  Excel: ["excel", "ms excel", "microsoft excel"],
  SPSS: ["spss"],
  Stata: ["stata"],
  SAS: ["sas"],
  R: ["r language", "r programming"],
  MATLAB: ["matlab"],

  // --- Marketing / Ads / Content ---
  "Google Ads": ["google ads", "google adwords", "adwords", "google ad words"],
  "Meta Ads": ["facebook ads", "meta ads", "fb ads", "instagram ads"],
  SEO: ["seo", "search engine optimization"],
  SEM: ["sem", "search engine marketing"],
  "Google Analytics": ["google analytics", "ga4", "google analytics 4", "analytics"],
  Copywriting: ["copy writing", "copywriter"],
  "Content Strategy": ["content strategy", "content planning"],
  "Social Media": ["social media", "social media management", "smm"],

  // --- Creative / Media ---
  "Adobe Creative Cloud": ["adobe cc", "adobe creative cloud", "adobe suite", "creative cloud"],
  Photoshop: ["adobe photoshop", "ps", "photoshop"],
  Illustrator: ["adobe illustrator", "illustrator", "ai (illustrator)"],
  InDesign: ["adobe indesign", "indesign"],
  "Premiere Pro": ["premiere", "adobe premiere", "adobe premiere pro"],
  "After Effects": ["after effects", "adobe after effects", "ae"],
  Lightroom: ["lightroom", "adobe lightroom"],
  "Final Cut Pro": ["final cut", "final cut pro", "fcp"],
  "DaVinci Resolve": ["davinci", "davinci resolve", "resolve"],
  Avid: ["avid media composer", "avid"],

  // --- Office / Admin / Finance ---
  "Microsoft Office": ["ms office", "office suite", "office 365", "microsoft office"],
  "Google Workspace": ["g suite", "google suite", "google workspace"],
  Word: ["word", "ms word", "microsoft word"],
  PowerPoint: ["powerpoint", "ms powerpoint", "power point"],
  Outlook: ["outlook", "microsoft outlook"],
  QuickBooks: ["quickbooks"],
  Xero: ["xero"],
  Sage: ["sage", "sage accounting"],
  "Data Entry": ["data entry"],
  "Bookkeeping": ["book keeping", "book-keeping"],
  SAP: ["sap"],
  NetSuite: ["netsuite"],
  Oracle: ["oracle e-business suite", "oracle erp", "oracle"],

  // --- Healthcare / Pharma ---
  EHR: [
    "ehr",
    "emr",
    "electronic medical records",
    "electronic medical record",
    "electronic health records",
  ],
  HIPAA: ["hipaa", "hippa", "hipaa compliance"],
  GMP: ["gmp", "good manufacturing practice", "cgmp", "current gmp"],
  GLP: ["glp", "good laboratory practice"],
  HACCP: ["haccp"],
  "ISO 9001": ["iso 9001"],
  BLS: ["bls", "bls certification", "bls cert", "basic life support"],
  ACLS: ["acls", "advanced cardiac life support", "acls certification"],
  CPR: ["cpr", "cpr certification", "cpr cert"],
  "Epic (EHR)": ["epic", "epic systems"],
  "Cerner (EHR)": ["cerner", "oracle cerner"],
  MEDITECH: ["meditech"],
  "ICD-10": ["icd10", "icd-10"],
  CPT: ["cpt", "cpt coding"],
  HL7: ["hl7"],
  DICOM: ["dicom"],
  Phlebotomy: ["phlebotomy", "venipuncture"],

  // --- Aviation ---
  "FAA Part 107": ["faa part 107", "part 107"],
  "EASA ATPL": ["easa atpl"],
  A320: ["a320", "a320 type rating", "airbus a320"],
  "A330 Type Rating": ["a330", "a330 type rating"],
  "A350 Type Rating": ["a350", "a350 type rating"],
  "B737 Type Rating": ["b737", "b737 type rating", "737 type rating"],
  "B777 Type Rating": ["b777", "b777 type rating"],

  // --- Oil & Gas / HSE / Offshore ---
  NEBOSH: ["nebosh", "nebosh igc"],
  "OSHA 10": ["osha 10", "osha-10"],
  "OSHA 30": ["osha 30", "osha-30"],
  "H2S Awareness": ["h2s", "h2s awareness"],
  BOSIET: ["bosiet"],
  HUET: ["huet"],
  "Confined Space": ["confined space", "confined space entry"],

  // --- Trades / Logistics / Manufacturing ---
  Forklift: ["forklift", "fork lift", "forklift license", "forklift certification"],
  CNC: ["cnc", "cnc machining", "cnc operator"],
  Welding: ["welding", "mig welding", "tig welding", "arc welding"],
  HVAC: ["hvac", "hvac-r"],
  Plumbing: ["plumbing", "plumber"],
  Electrical: ["electrical"],
  Carpentry: ["carpentry", "carpenter"],
  Blueprint: ["blueprint reading", "blueprints"],
  POS: [
    "pos",
    "point of sale",
    "point-of-sale",
    "micros pos",
    "toast pos",
    "square pos",
    "aloha pos",
  ],
  "CDL Class A": ["cdl a", "class a cdl", "cdl class a"],
  "CDL Class B": ["cdl b", "class b cdl", "cdl class b"],
  "CDL Class C": ["cdl c", "class c cdl", "cdl class c"],

  // --- Education / Social care / Legal ---
  TEFL: ["tefl"],
  TESOL: ["tesol"],
  CELTA: ["celta"],
  QTS: ["qts", "qualified teacher status"],
  PGCE: ["pgce"],
  DBS: ["dbs", "dbs check", "dbs clearance"],
  Safeguarding: ["safeguarding", "safeguarding training"],
  "First Aid": ["first aid", "first-aid"],
  Westlaw: ["westlaw", "west law"],
  LexisNexis: ["lexisnexis"],

  // --- Security / Compliance ---
  SIA: ["sia", "sia license", "security industry authority"],
  BS7858: ["bs7858", "bs 7858", "bs7858 screening"],
  "Background Checks": ["background check", "criminal record check"],
  GDPR: ["gdpr"],
  PCI: ["pci", "pci compliance", "pci dss", "pci-dss"],
  SOC2: ["soc 2", "soc2"],

  // --- Management / Soft skills (keep short, unambiguous) ---
  "Customer Service": ["customer service", "customer support", "customer services"],
  Communication: ["communication", "communications", "communication skills"],
  Teamwork: ["teamwork", "team player", "team players"],
  "Problem Solving": ["problem solving", "problem-solving"],
  "Time Management": ["time management", "time-management"],
  "Attention To Detail": ["attention to detail", "detail oriented", "detail-oriented"],
  Leadership: ["leadership", "team leadership"],
  "Project Management": ["project management", "project mgmt"], // removed "pm" (ambiguous)
  "People Management": ["people management", "people mgmt"],
  "Stakeholder Management": ["stakeholder management", "stakeholder mgmt"],
  "Change Management": ["change management"],
  "Product Management": ["product management", "product mgmt"],
  "Business Analysis": ["business analysis", "business analyst"],
};

const regexRules: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  // Licenses/Certs normalized short form
  [/^(?:cpr)(?:\s+(?:cert|certificate|certification))?$/i, () => "CPR"],
  [/^(?:bls)(?:\s+(?:cert|certificate|certification))?$/i, () => "BLS"],
  [/^(?:acls)(?:\s+(?:cert|certificate|certification))?$/i, () => "ACLS"],
  [/^forklift(?:\s+(?:licen[cs]e|cert|certificate|certification))?$/i, () => "Forklift"],
  [/^(?:cdl)(?:\s*(?:class)?\s*a)$/i, () => "CDL Class A"],
  [/^(?:cdl)(?:\s*(?:class)?\s*b)$/i, () => "CDL Class B"],
  [/^(?:cdl)(?:\s*(?:class)?\s*c)$/i, () => "CDL Class C"],

  // Food safety / POS
  [/^food\s+(?:handler|hygiene|safety)$/i, () => "Food Safety"],
  [/^(?:pos|point\s+of\s+sale)(?:\s+systems?)?$/i, () => "POS"],

  // Ads platforms variants
  [/^(?:google\s+)?ad\s*words$/i, () => "Google Ads"],
  [/^(?:google\s+ads?)$/i, () => "Google Ads"],
  [/^(?:facebook\s+ads?|meta\s+ads?|fb\s+ads?)$/i, () => "Meta Ads"],

  // EHR/EMR phrases
  [/^electronic\s+(?:medical|health)\s+records?$/i, () => "EHR"],

  // Office apps
  [/^(?:ms|microsoft)\s+excel$/i, () => "Excel"],
  [/^(?:ms|microsoft)\s+word$/i, () => "Word"],
  [/^(?:ms\s+)?power\s*point$/i, () => "PowerPoint"],
  [/^(?:microsoft\s+office|ms\s+office|office\s+365|office\s+suite)$/i, () => "Microsoft Office"],
  [/^(?:g\s*suite|google\s+suite|google\s+workspace)$/i, () => "Google Workspace"],

  // Tech equivalences
  [/^html\s*5$/i, () => "HTML"],
  [/^css\s*3$/i, () => "CSS"],
  [/^es\s*2015$/i, () => "JavaScript"],
  [/^es\s*6$/i, () => "JavaScript"],
  [/^react\s*js$/i, () => "React"],
  [/^vue\s*js$/i, () => "Vue"],
  [/^angular\s*js$/i, () => "AngularJS"],
  [/^node\s*(?:js)?$/i, () => "Node.js"],
  [/^next\s*(?:js)?$/i, () => "Next.js"],
  [/^express\s*(?:js)?$/i, () => "Express"],
  [/^python\s*3$/i, () => "Python 3"],
  [/^python\s*2$/i, () => "Python 2"],

  // Git hosting families
  [/^(?:git\s*hub|github)$/i, () => "Git"],
  [/^(?:git\s*lab|gitlab)$/i, () => "Git"],
  [/^(?:bit\s*bucket|bitbucket)$/i, () => "Git"],

  // Git CI tools (kept distinct)
  [/^github\s+actions$/i, () => "GitHub Actions"],
  [/^gitlab\s+ci(?:\/?cd)?$/i, () => "GitLab CI"],
  [/^bitbucket\s+pipelines?$/i, () => "Bitbucket Pipelines"],

  // Safety/quality frameworks
  [/^good\s+manufacturing\s+practice$/i, () => "GMP"],
  [/^good\s+laboratory\s+practice$/i, () => "GLP"],
  [/^good\s+clinical\s+practice$/i, () => "GCP"],
  [/^iso\s*9001$/i, () => "ISO 9001"],
  [/^haccp$/i, () => "HACCP"],
  [/^(?:osha[-\s]*)?10$/i, () => "OSHA 10"],
  [/^(?:osha[-\s]*)?30$/i, () => "OSHA 30"],

  // Aviation / Offshore
  [/^(?:faa\s*)?part\s*107$/i, () => "FAA Part 107"],
  [/^bosiet$/i, () => "BOSIET"],
  [/^huet$/i, () => "HUET"],

  // Soft skills cleanup to canonical short
  [/^communication(?:\s+skills?)?$/i, () => "Communication"],
  [/^team(?:\s+player|work)$/i, () => "Teamwork"],
  [/^problem(?:[-\s]+)solving$/i, () => "Problem Solving"],
  [/^time(?:[-\s]+)management$/i, () => "Time Management"],
  [/^(?:attention\s+to\s+detail|detail[-\s]?oriented)$/i, () => "Attention To Detail"],
];

const REGEX_CANONICALS = new Set<string>([
  // from regex rules above (ensure canonical set includes these)
  "CPR",
  "BLS",
  "ACLS",
  "Forklift",
  "CDL Class A",
  "CDL Class B",
  "CDL Class C",
  "Food Safety",
  "POS",
  "Google Ads",
  "Meta Ads",
  "EHR",
  "Excel",
  "Word",
  "PowerPoint",
  "Microsoft Office",
  "Google Workspace",
  "HTML",
  "CSS",
  "JavaScript",
  "React",
  "Vue",
  "AngularJS",
  "Node.js",
  "Next.js",
  "Express",
  "Python 3",
  "Python 2",
  "Git",
  "GitHub Actions",
  "GitLab CI",
  "Bitbucket Pipelines",
  "GMP",
  "GLP",
  "GCP",
  "ISO 9001",
  "HACCP",
  "OSHA 10",
  "OSHA 30",
  "FAA Part 107",
  "BOSIET",
  "HUET",
  "Communication",
  "Teamwork",
  "Problem Solving",
  "Time Management",
  "Attention To Detail",
]);

registerSynonyms(BASE_SYNONYMS);
REGEX_CANONICALS.forEach(registerCanonical);

// ------------------ PUBLIC API ------------------
export const mapSkillSynonym = (value: string): string => {
  return resolveSkillSynonym(value).canonical;
};

export const mapSkillSynonymSmart = async (value: string): Promise<string> => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const resolution = resolveSkillSynonym(trimmed);
  const cacheKey = resolution.normalized || trimmed.toLowerCase();
  const cached = semanticResolutionCache.get(cacheKey);
  if (cached) return cached;

  // Direct/regex hit or no candidates → done.
  if (resolution.matched || !resolution.candidates.length) {
    semanticResolutionCache.set(cacheKey, resolution.canonical);
    return resolution.canonical;
  }

  const semantic = await semanticResolve(trimmed, resolution.candidates);
  const finalValue = semantic ?? resolution.canonical;
  semanticResolutionCache.set(cacheKey, finalValue);
  return finalValue;
};

export const getSynonymLookupSize = () => synonymLookup.size;

export const extendSkillSynonyms = (extra: SynonymConfig) => {
  registerSynonyms(extra);
  clearResolutionCaches();
};

// ------------------ Internals ------------------
function clearResolutionCaches() {
  resolutionCache.clear();
  semanticResolutionCache.clear();
}

function resolveSkillSynonym(raw: string): SkillResolution {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { canonical: "", normalized: "", matched: false, candidates: [] };
  }

  const normalized = normalizeKey(trimmed);
  if (!normalized) {
    return { canonical: trimmed, normalized: "", matched: false, candidates: [] };
  }

  const cached = resolutionCache.get(normalized);
  if (cached) return cached;

  let canonical = trimmed;
  let matched = false;
  let candidates: FuzzyCandidate[] = [];

  // 1) Direct lookup
  const direct = synonymLookup.get(normalized);
  if (direct) {
    canonical = direct;
    matched = true;
  } else {
    // 2) Regex rules
    for (const [pattern, handler] of regexRules) {
      const match = pattern.exec(trimmed);
      if (match) {
        canonical = handler(match);
        registerCanonical(canonical);
        matched = true;
        break;
      }
    }

    // 3) Fuzzy family search
    if (!matched) {
      candidates = getFuzzyCandidates(normalized);
      const best = candidates[0];
      if (best && best.score >= FUZZY_STRICT_THRESHOLD) {
        canonical = best.canonical;
        matched = true;
        candidates = [];
      }
    }
  }

  const result: SkillResolution = { canonical, normalized, matched, candidates };
  resolutionCache.set(normalized, result);
  return result;
}

function getFuzzyCandidates(normalized: string): FuzzyCandidate[] {
  if (!normalized) return [];
  const targetVector = buildBigramVector(normalized);
  if (!targetVector.size) return [];

  const scored: FuzzyCandidate[] = [];
  for (const canonical of canonicalSkillSet) {
    const meta = canonicalMetadata.get(canonical);
    if (!meta?.vector.size) continue;
    const score = cosineFromMaps(targetVector, meta.vector);
    if (score >= FUZZY_SEMANTIC_MIN - 0.15) {
      scored.push({ canonical, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_FUZZY_CANDIDATES);
}

// Uses embeddings to disambiguate close candidates (e.g., “GCP”: cloud vs clinical).
async function semanticResolve(
  raw: string,
  candidates: FuzzyCandidate[]
): Promise<string | null> {
  if (!areEmbeddingsEnabled()) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const viable = candidates
    .filter((c) => c.score >= FUZZY_SEMANTIC_MIN)
    .slice(0, MAX_FUZZY_CANDIDATES);

  if (!viable.length) return null;

  const inputVector = await getEmbeddingForText(trimmed);
  if (!inputVector) return null;

  let best: { canonical: string; score: number } | null = null;
  for (const cand of viable) {
    const cv = await getEmbeddingForText(cand.canonical);
    if (!cv) continue;
    const s = cosineSimilarity(inputVector, cv);
    if (!best || s > best.score) best = { canonical: cand.canonical, score: s };
  }

  if (best && best.score >= SEMANTIC_SCORE_THRESHOLD) {
    return best.canonical;
  }
  return null;
}

async function getEmbeddingForText(text: string): Promise<number[] | null> {
  const key = text.toLowerCase();
  if (embeddingVectorCache.has(key)) return embeddingVectorCache.get(key)!;

  let promise = embeddingPromiseCache.get(key);
  if (!promise) {
    promise = (async () => {
      try {
        const vector = await generateTextEmbedding(text);
        if (vector) {
          embeddingVectorCache.set(key, vector);
          return vector;
        }
        return null;
      } catch (error) {
        console.warn(`[skill-mapper] Failed to embed "${text}":`, (error as Error).message);
        return null;
      } finally {
        embeddingPromiseCache.delete(key);
      }
    })();
    embeddingPromiseCache.set(key, promise);
  }

  const result = await promise;
  if (!result) {
    embeddingVectorCache.delete(key);
    return null;
  }
  return result;
}
