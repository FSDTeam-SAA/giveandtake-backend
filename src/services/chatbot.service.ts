import crypto from "crypto";
import mongoose from "mongoose";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Collection } from "mongodb";

import Content from "../models/Content";
import Faq from "../models/Faq.model";
import { Blog } from "../models/Blog.model";
import ChatbotKnowledge, {
  ChatbotKnowledgeSource,
  IChatbotKnowledge,
} from "../models/ChatbotKnowledge.model";
import ChatbotQA from "../models/ChatbotQA.model";
import stripHtml from "../utils/stripHtml";

export interface ChatAnswer {
  answer: string;
  sources: Array<
    Pick<
      IChatbotKnowledge,
      "sourceType" | "sourceId" | "chunkIndex" | "text" | "metadata"
    > & { score: number }
  >;
}

export type ChatHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

type UpsertSourceOptions = {
  sourceType: ChatbotKnowledgeSource;
  sourceId?: string;
  text: string;
  metadata?: Record<string, unknown>;
};

type NormalizedHistoryEntry = ChatHistoryEntry & { index: number };

type KnowledgeInsert = {
  _id: mongoose.Types.ObjectId;
  sourceType: ChatbotKnowledgeSource;
  sourceId?: string;
  chunkIndex: number;
  text: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
  hash: string;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_VECTOR_INDEX =
  process.env.MONGODB_VECTOR_INDEX ?? "chatbot_vector_index";
const DEFAULT_EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004";
const DEFAULT_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash-lite";

class ChatbotService {
  private readonly embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: this.requireEnv("GEMINI_API_KEY"),
    model: DEFAULT_EMBED_MODEL,
  });

  private readonly chatModel = new ChatGoogleGenerativeAI({
    apiKey: this.requireEnv("GEMINI_API_KEY"),
    model: DEFAULT_CHAT_MODEL,
    temperature: 0.3,
    maxOutputTokens: 1024,
  });

  private readonly textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 120,
  });

  private requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  /**
   * Rebuilds the knowledge base from all sources.
   */
  async rebuildKnowledgeBase(): Promise<void> {
    await Promise.all([
      this.syncAllContentEntries(),
      this.syncAllFaqEntries(),
      this.syncAllBlogEntries(),
      this.syncAllCustomQAEntries(),
    ]);
  }

  /**
   * Syncs (or resyncs) every Content document into the knowledge base.
   */
  async syncAllContentEntries(): Promise<void> {
    const contents = await Content.find();
    for (const content of contents) {
      const textParts = [
        content.title,
        stripHtml(content.description ?? ""),
      ].filter(Boolean);

      if (!textParts.length) {
        await this.removeSource("content", content.id);
        continue;
      }

      await this.upsertSource({
        sourceType: "content",
        sourceId: content.id,
        text: textParts.join("\n\n"),
        metadata: {
          type: content.type,
          title: content.title,
        },
      });
    }
  }

  /**
   * Syncs (or resyncs) every Blog document into the knowledge base.
   */
  async syncAllBlogEntries(): Promise<void> {
    const blogs = await Blog.find();
    for (const blog of blogs) {
      const textParts = [
        blog.title,
        stripHtml(blog.description ?? ""),
      ].filter(Boolean);

      if (!textParts.length) {
        await this.removeSource("blog", blog.id);
        continue;
      }

      await this.upsertSource({
        sourceType: "blog",
        sourceId: blog.id,
        text: textParts.join("\n\n"),
        metadata: {
          title: blog.title,
          type: "blog",
        },
      });
    }
  }

  /**
   * Syncs (or resyncs) every FAQ document into the knowledge base.
   */
  async syncAllFaqEntries(): Promise<void> {
    const faqs = await Faq.find();
    for (const faq of faqs) {
      const answerText = stripHtml(faq.answer ?? "");
      const combined = `Question:\n${faq.question}\n\nAnswer:\n${answerText}`;

      await this.upsertSource({
        sourceType: "faq",
        sourceId: faq.id,
        text: combined,
        metadata: {
          category: faq.category ?? "general",
        },
      });
    }
  }

  /**
   * Syncs (or resyncs) each active custom QA entry into the knowledge base.
   */
  async syncAllCustomQAEntries(): Promise<void> {
    const customEntries = await ChatbotQA.find({ isActive: true });
    for (const entry of customEntries) {
      const combined = `Question:\n${entry.question}\n\nAnswer:\n${entry.answer}`;

      await this.upsertSource({
        sourceType: "custom",
        sourceId: entry.id,
        text: combined,
        metadata: {
          tags: entry.tags ?? [],
        },
      });
    }
  }

  /**
   * Syncs a single Blog entry, typically after create/update.
   */
  async syncSingleBlog(blogId: string): Promise<void> {
    const blog = await Blog.findById(blogId);
    if (!blog) {
      await this.removeSource("blog", blogId);
      return;
    }

    const textParts = [
      blog.title,
      stripHtml(blog.description ?? ""),
    ].filter(Boolean);

    if (!textParts.length) {
      await this.removeSource("blog", blogId);
      return;
    }

    await this.upsertSource({
      sourceType: "blog",
      sourceId: blog.id,
      text: textParts.join("\n\n"),
      metadata: {
        title: blog.title,
        type: "blog",
      },
    });
  }

  /**
   * Syncs a single FAQ entry, typically after create/update.
   */
  async syncSingleFaq(faqId: string): Promise<void> {
    const faq = await Faq.findById(faqId);
    if (!faq) {
      await this.removeSource("faq", faqId);
      return;
    }

    const answerText = stripHtml(faq.answer ?? "");
    const combined = `Question:\n${faq.question}\n\nAnswer:\n${answerText}`;

    await this.upsertSource({
      sourceType: "faq",
      sourceId: faq.id,
      text: combined,
      metadata: {
        category: faq.category ?? "general",
      },
    });
  }

  /**
   * Syncs a single Content entry, typically after create/update.
   */
  async syncSingleContent(contentId: string): Promise<void> {
    const content = await Content.findById(contentId);
    if (!content) {
      await this.removeSource("content", contentId);
      return;
    }

    const textParts = [
      content.title,
      stripHtml(content.description ?? ""),
    ].filter(Boolean);

    if (!textParts.length) {
      await this.removeSource("content", contentId);
      return;
    }

    await this.upsertSource({
      sourceType: "content",
      sourceId: content.id,
      text: textParts.join("\n\n"),
      metadata: {
        type: content.type,
        title: content.title,
      },
    });
  }

  /**
   * Syncs or removes a single custom QA entry based on its state.
   */
  async syncSingleCustomQA(customId: string): Promise<void> {
    const entry = await ChatbotQA.findById(customId);
    if (!entry || !entry.isActive) {
      await this.removeSource("custom", customId);
      return;
    }

    const combined = `Question:\n${entry.question}\n\nAnswer:\n${entry.answer}`;

    await this.upsertSource({
      sourceType: "custom",
      sourceId: entry.id,
      text: combined,
      metadata: {
        tags: entry.tags ?? [],
      },
    });
  }

  /**
   * Crops an entire source from the knowledge collection.
   */
  async removeSource(
    sourceType: ChatbotKnowledgeSource,
    sourceId?: string
  ): Promise<void> {
    const conditions: Record<string, unknown> = { sourceType };
    if (sourceId) {
      conditions.sourceId = sourceId;
    }
    await ChatbotKnowledge.deleteMany(conditions);
  }

  /**
   * Answers a user question leveraging the stored knowledge base.
   */
  async answerQuestion(
    question: string,
    topK = 5,
    history?: ChatHistoryEntry[]
  ): Promise<ChatAnswer> {
    const relevant = await this.retrieveRelevantKnowledge(question, topK);

    const context = relevant
      .map(
        (doc, idx) =>
          `Source ${idx + 1} (type: ${doc.sourceType}):\n${doc.text.trim()}`
      )
      .join("\n\n");

    const systemMessage = new SystemMessage(
  "You are Elevator Video Pitch's assistant. Use the given context to answer questions about the EVP platform clearly and politely. " +
  "If there's no context, answer that generally but also encourage the user to ask about the EVP website. " +
  "For more info, contact admin@evpitch.com.\n\n" +
  `Context:\n${context || "No relevant context provided."}`
);


    const historyMessages = this.buildCondensedHistoryMessages(history);
    const messages = [
      systemMessage,
      ...historyMessages,
      new HumanMessage(question),
    ];

    const completion = await this.chatModel.invoke(messages);
    const answer =
      Array.isArray(completion.content)
        ? completion.content
            .map((part) =>
              typeof part === "string"
                ? part
                : "text" in part && typeof part.text === "string"
                ? part.text
                : ""
            )
            .join("")
        : (completion.content as string);

    return {
      answer,
      sources: relevant,
    };
  }

  private buildCondensedHistoryMessages(
    history?: ChatHistoryEntry[]
  ): Array<HumanMessage | AIMessage | SystemMessage> {
    const normalized = this.normalizeHistory(history);
    if (!normalized.length) {
      return [];
    }

    const earliestSegment = normalized.slice(0, 2);
    const lastSegment = normalized.slice(-3);

    const condensed: Array<HumanMessage | AIMessage | SystemMessage> = [];

    if (earliestSegment.length) {
      condensed.push(
        new SystemMessage(
          `Early conversation summary (first ${earliestSegment.length} messages): ${this.summarizeHistorySegment(
            earliestSegment
          )}`
        )
      );
    }

    for (const entry of lastSegment) {
      condensed.push(
        entry.role === "assistant"
          ? new AIMessage(entry.content)
          : new HumanMessage(entry.content)
      );
    }

    return condensed;
  }

  private normalizeHistory(
    history?: ChatHistoryEntry[]
  ): NormalizedHistoryEntry[] {
    if (!history?.length) {
      return [];
    }

    return history
      .map((entry, index) => ({
        role: entry.role,
        content: entry.content.trim(),
        index,
      }))
      .filter((entry) => Boolean(entry.content.length));
  }

  private summarizeHistorySegment(entries: NormalizedHistoryEntry[]): string {
    return entries
      .map((entry) => {
        const speaker = entry.role === "assistant" ? "Assistant" : "User";
        return `${speaker} message ${entry.index + 1}: ${this.compressHistoryText(
          entry.content
        )}`;
      })
      .join(" | ");
  }

  private compressHistoryText(text: string, maxLength = 220): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 3)}...`;
  }

  private async upsertSource(options: UpsertSourceOptions): Promise<void> {
    const { sourceType, sourceId, text, metadata } = options;
    if (!text?.trim()) {
      await this.removeSource(sourceType, sourceId);
      return;
    }

    const documents = await this.textSplitter.createDocuments(
      [text],
      metadata ? [metadata] : undefined
    );

    if (!documents.length) {
      await this.removeSource(sourceType, sourceId);
      return;
    }

    const embeddings = await this.embeddings.embedDocuments(
      documents.map((doc) => doc.pageContent)
    );

    const payload: KnowledgeInsert[] = documents.map((doc, idx) => ({
      sourceType,
      sourceId,
      chunkIndex: idx,
      text: doc.pageContent,
      metadata: { ...metadata, ...doc.metadata },
      embedding: embeddings[idx],
      hash: this.getContentHash(sourceType, sourceId, doc.pageContent),
      createdAt: new Date(),
      updatedAt: new Date(),
      _id: new mongoose.Types.ObjectId(),
    }));

    const filter: Record<string, unknown> = { sourceType };
    if (sourceId) {
      filter.sourceId = sourceId;
    }

    await ChatbotKnowledge.deleteMany(filter);
    if (payload.length) {
      await ChatbotKnowledge.insertMany(payload);
    }
  }

  private getContentHash(
    sourceType: ChatbotKnowledgeSource,
    sourceId: string | undefined,
    text: string
  ): string {
    return crypto
      .createHash("sha256")
      .update([sourceType, sourceId ?? "unknown", text].join("::"))
      .digest("hex");
  }

  private async retrieveRelevantKnowledge(
    question: string,
    topK: number
  ): Promise<ChatAnswer["sources"]> {
    const queryVector = await this.embeddings.embedQuery(question);

    try {
      const collection = this.getKnowledgeCollection();
      const pipeline = [
        {
          $vectorSearch: {
            index: DEFAULT_VECTOR_INDEX,
            path: "embedding",
            queryVector,
            numCandidates: Math.max(topK * 15, 200),
            limit: topK,
          },
        },
        {
          $project: {
            text: 1,
            metadata: 1,
            sourceType: 1,
            sourceId: 1,
            chunkIndex: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ];

      const results = await collection
        .aggregate<ChatAnswer["sources"][number]>(pipeline)
        .toArray();

      if (results.length) {
        return results;
      }
    } catch (error) {
      // Fallback to in-memory similarity if vector search is not available.
      console.warn(
        "[chatbot] Falling back to in-memory similarity search:",
        (error as Error).message
      );
    }

    const allDocs = await ChatbotKnowledge.find().lean();
    const scored = allDocs
      .map((doc) => ({
        ...doc,
        score: this.cosineSimilarity(queryVector, doc.embedding),
      }))
      .filter((item) => !Number.isNaN(item.score));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((doc) => ({
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        chunkIndex: doc.chunkIndex,
        text: doc.text,
        metadata: doc.metadata,
        score: doc.score,
      }));
  }

  private getKnowledgeCollection(): Collection<IChatbotKnowledge> {
    const connection = mongoose.connection;
    if (!connection || connection.readyState !== 1) {
      throw new Error("MongoDB connection is not ready");
    }
    return connection.collection(
      ChatbotKnowledge.collection.name
    ) as Collection<IChatbotKnowledge>;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) {
      return Number.NaN;
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
      return Number.NaN;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const chatbotService = new ChatbotService();

export default chatbotService;
