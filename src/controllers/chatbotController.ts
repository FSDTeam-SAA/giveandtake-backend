import { Request, Response } from "express";
import ChatbotQA from "../models/ChatbotQA.model";
import chatbotService from "../services/chatbot.service";

export const chatWithBot = async (req: Request, res: Response): Promise<void> => {
  const { question, topK } = req.body as {
    question?: string;
    topK?: number;
  };

  if (!question?.trim()) {
    res.status(400).json({
      status: "error",
      message: "A question is required.",
    });
    return;
  }

  try {
    const answer = await chatbotService.answerQuestion(
      question.trim(),
      Number.isFinite(topK) ? Math.min(Math.max(Number(topK), 1), 10) : 5
    );

    res.status(200).json({
      status: "success",
      data: answer,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Failed to process chatbot request.",
    });
  }
};

export const rebuildChatbotKnowledge = async (_req: Request, res: Response): Promise<void> => {
  try {
    await chatbotService.rebuildKnowledgeBase();
    res.status(200).json({
      status: "success",
      message: "Chatbot knowledge base rebuilt successfully.",
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Unable to rebuild chatbot knowledge base.",
    });
  }
};

export const createChatbotQA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, answer, tags, isActive } = req.body as {
      question: string;
      answer: string;
      tags?: string[];
      isActive?: boolean;
    };

    if (!question?.trim() || !answer?.trim()) {
      res.status(400).json({
        status: "error",
        message: "Both question and answer are required.",
      });
      return;
    }

    const qa = await ChatbotQA.create({
      question: question.trim(),
      answer: answer.trim(),
      tags: tags ?? [],
      isActive: isActive ?? true,
    });

    await chatbotService.syncSingleCustomQA(qa.id);

    res.status(201).json({
      status: "success",
      message: "Chatbot QA created.",
      data: qa,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Unable to create chatbot QA.",
    });
  }
};

export const updateChatbotQA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { question, answer, tags, isActive } = req.body as {
      question?: string;
      answer?: string;
      tags?: string[];
      isActive?: boolean;
    };

    const update: Record<string, unknown> = {};
    if (typeof question === "string") update.question = question.trim();
    if (typeof answer === "string") update.answer = answer.trim();
    if (Array.isArray(tags)) update.tags = tags;
    if (typeof isActive === "boolean") update.isActive = isActive;

    const qa = await ChatbotQA.findByIdAndUpdate(id, update, { new: true });

    if (!qa) {
      res.status(404).json({
        status: "error",
        message: "Chatbot QA not found.",
      });
      return;
    }

    await chatbotService.syncSingleCustomQA(id);

    res.status(200).json({
      status: "success",
      message: "Chatbot QA updated.",
      data: qa,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Unable to update chatbot QA.",
    });
  }
};

export const listChatbotQA = async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const filter = includeInactive ? {} : { isActive: true };

    const qaList = await ChatbotQA.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      data: qaList,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Unable to fetch chatbot QA list.",
    });
  }
};

export const deleteChatbotQA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await ChatbotQA.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({
        status: "error",
        message: "Chatbot QA not found.",
      });
      return;
    }

    await chatbotService.removeSource("custom", id);

    res.status(200).json({
      status: "success",
      message: "Chatbot QA deleted.",
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Unable to delete chatbot QA.",
    });
  }
};

export const toggleChatbotQAStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive } = req.body as { isActive?: boolean };

    if (typeof isActive !== "boolean") {
      res.status(400).json({
        status: "error",
        message: "Provide a boolean isActive flag.",
      });
      return;
    }

    const qa = await ChatbotQA.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!qa) {
      res.status(404).json({
        status: "error",
        message: "Chatbot QA not found.",
      });
      return;
    }

    await chatbotService.syncSingleCustomQA(id);

    res.status(200).json({
      status: "success",
      message: `Chatbot QA ${isActive ? "activated" : "deactivated"}.`,
      data: qa,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message ?? "Unable to update chatbot QA status.",
    });
  }
};
