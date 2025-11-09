type SynonymConfig = Record<string, string[]>;

const BASE_SYNONYMS: SynonymConfig = {
  javascript: ["js", "java script", "vanilla js"],
  typescript: ["ts", "type script"],
  "node.js": ["node", "nodejs", "node js"],
  react: ["reactjs", "react.js"],
  "react native": ["rn", "reactnative", "react-native"],
  "c#": ["c sharp", "csharp"],
  "c++": ["cpp", "c plus plus"],
  "ci/cd": ["ci cd", "continuous integration", "continuous delivery"],
  "git/github": ["git", "github"],
  aws: ["amazon web services", "aws cloud"],
  sql: ["structured query language"],
};

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+#/.&\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const synonymLookup = new Map<string, string>();

const registerSynonyms = (config: SynonymConfig) => {
  for (const [canonical, variants] of Object.entries(config)) {
    const canonicalKey = normalizeKey(canonical);
    synonymLookup.set(canonicalKey, canonical);

    for (const variant of variants) {
      synonymLookup.set(normalizeKey(variant), canonical);
    }
  }
};

registerSynonyms(BASE_SYNONYMS);

export const mapSkillSynonym = (value: string): string => {
  const normalized = normalizeKey(value);
  return synonymLookup.get(normalized) ?? value;
};

export const getSynonymLookupSize = () => synonymLookup.size;

export const extendSkillSynonyms = (extra: SynonymConfig) => {
  registerSynonyms(extra);
};

