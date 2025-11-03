import { Request, Response } from "express";
import Faq, { IFaq } from "../models/Faq.model";
import chatbotService from "../services/chatbot.service";

// Create or update FAQ
export const upsertFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { _id, question, answer, category, order } = req.body as IFaq;

    let faq: IFaq | null;

    if (_id) {
      faq = await Faq.findByIdAndUpdate(
        _id,
        { question, answer, category, order },
        { new: true }
      );
    } else {
      faq = await Faq.create({ question, answer, category, order });
    }

    if (!faq) {
      res.status(404).json({
        status: "error",
        message: "FAQ not found.",
        data: null,
      });
      return;
    }

    await chatbotService.syncSingleFaq(faq.id);

    res.status(200).json({
      status: "success",
      message: "FAQ saved successfully.",
      data: faq,
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Get all FAQs
export const getAllFaqs = async (req: Request, res: Response): Promise<void> => {
  try {
    const faqs = await Faq.find().sort({ order: 1, createdAt: -1 });
    res.status(200).json({
      status: "success",
      message: "FAQs retrieved successfully.",
      data: faqs,
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Delete FAQ
export const deleteFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await Faq.findByIdAndDelete(id);
    await chatbotService.removeSource("faq", id);
    res.status(200).json({ status: "success", message: "FAQ deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
