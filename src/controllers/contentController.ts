import { Request, Response } from "express";
import Content, { IContent } from "../models/Content";
import chatbotService from "../services/chatbot.service";

export const upsertContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, title, description } = req.body as IContent;

    const content = await Content.findOneAndUpdate(
      { type },
      { title, description },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (content?.id) {
      await chatbotService.syncSingleContent(content.id);
    }

    res.status(200).json(content);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getAllContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const content = await Content.find();

    res.status(200).json({
      status: "success",
      message: "Content retrieved successfully.",
      data: content,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error retrieving content.";

    res.status(500).json({
      status: "error",
      message,
      data: null,
    });
  }
};


export const getContentByType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;
    const content = await Content.findOne({ type });
    if (!content) {
      res.status(404).json({ message: "Content not found" });
      return;
    }
    res.status(200).json({
      status: "success",
      message: "Content retrieved successfully.",
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
