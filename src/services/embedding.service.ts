import type { Document } from "mongoose";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import type { IJob } from "../interface/job.interface";
import type { ICreateResume } from "../interface/createResume.interface";
import type { IExperience } from "../interface/experience.interface";
import type { IEducation } from "../interface/education.interface";
import { buildJobText, buildProfileText } from "../utils/jobFitText";

const DEFAULT_EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004";

const embeddingsFlag =
  (process.env.JOB_EMBEDDINGS ?? "on").toLowerCase() !== "off";

let embeddingsClient: GoogleGenerativeAIEmbeddings | null = null;

const getEmbedder = (): GoogleGenerativeAIEmbeddings | null => {
  if (!embeddingsFlag) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!embeddingsClient) {
    embeddingsClient = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: DEFAULT_EMBED_MODEL,
    });
  }

  return embeddingsClient;
};

export const areEmbeddingsEnabled = () => embeddingsFlag;

export const generateTextEmbedding = async (
  text: string | undefined | null
): Promise<number[] | null> => {
  const embedder = getEmbedder();
  if (!embedder) {
    return null;
  }

  const clean = text?.trim();
  if (!clean) {
    return null;
  }

  return embedder.embedQuery(clean);
};

export const generateJobEmbeddingVector = async (
  job: Partial<IJob>
): Promise<number[] | null> => {
  if (!embeddingsFlag) return null;
  if (job.status && job.status !== "active") {
    return null;
  }
  if (Array.isArray(job.embedding) && job.embedding.length) {
    return job.embedding;
  }

  const text = buildJobText(job);
  return generateTextEmbedding(text);
};

export const generateProfileEmbeddingVector = async (
  resume: Partial<ICreateResume>,
  experiences?: Array<Partial<IExperience>>,
  education?: Array<Partial<IEducation>>
): Promise<number[] | null> => {
  if (!embeddingsFlag) return null;
  const text = buildProfileText(resume, experiences, education);
  return generateTextEmbedding(text);
};

export const applyJobEmbeddingToDoc = async <T extends Document & IJob>(
  jobDoc: T
): Promise<boolean> => {
  if (!embeddingsFlag) return false;
  const isActive = !jobDoc.status || jobDoc.status === "active";

  if (!isActive) {
    const hadEmbedding =
      Array.isArray(jobDoc.embedding) && jobDoc.embedding.length > 0;
    jobDoc.embedding = [];
    return hadEmbedding;
  }

  const embedding = await generateJobEmbeddingVector(jobDoc);
  if (!embedding) return false;
  jobDoc.embedding = embedding;
  return true;
};

export const cosineSimilarity = (
  a: number[] | null | undefined,
  b: number[] | null | undefined
): number => {
  if (!a?.length || !b?.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

