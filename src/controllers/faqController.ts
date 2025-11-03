import { Request, Response } from "express";
import Faq, { IFaq } from "../models/Faq.model";
import chatbotService from "../services/chatbot.service";

/**
 * Normalize FAQ order after any CRUD operation
 * Ensures that FAQ orders are sequential (1, 2, 3, ...)
 */
const normalizeFaqOrder = async (): Promise<void> => {
  const faqs = await Faq.find().sort({ order: 1 });
  for (let i = 0; i < faqs.length; i++) {
    if (faqs[i].order !== i + 1) {
      faqs[i].order = i + 1;
      await faqs[i].save();
    }
  }
};

/**
 * Create or update FAQ with correct ordering
 */
export const upsertFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { _id, question, answer, category, order } = req.body as IFaq;

    let faq: IFaq | null;

    if (_id) {
      // --- UPDATE existing FAQ ---
      const existing = await Faq.findById(_id);
      if (!existing) {
        res.status(404).json({
          status: "error",
          message: "FAQ not found.",
          data: null,
        });
        return;
      }

      // If order changed, adjust other FAQs
      if (order !== undefined && existing.order !== undefined && existing.order !== order) {
        if (existing.order < order) {
          // Move down — shift affected FAQs up
          await Faq.updateMany(
            { order: { $gt: existing.order, $lte: order } },
            { $inc: { order: -1 } }
          );
        } else {
          // Move up — shift affected FAQs down
          await Faq.updateMany(
            { order: { $gte: order, $lt: existing.order } },
            { $inc: { order: 1 } }
          );
        }
      }

      faq = await Faq.findByIdAndUpdate(
        _id,
        { question, answer, category, order },
        { new: true }
      );
    } else {
      // --- CREATE new FAQ ---
      let insertOrder = order ?? 1;
      const totalCount = await Faq.countDocuments();

      // If order exceeds total FAQs, append at end
      if (insertOrder > totalCount + 1) {
        insertOrder = totalCount + 1;
      }

      // Shift all with order >= insertOrder down
      await Faq.updateMany({ order: { $gte: insertOrder } }, { $inc: { order: 1 } });

      faq = await Faq.create({ question, answer, category, order: insertOrder });
    }

    // Normalize after change
    await normalizeFaqOrder();

    // Sync chatbot after save
    if (faq) await chatbotService.syncSingleFaq(faq.id);

    res.status(200).json({
      status: "success",
      message: "FAQ saved successfully.",
      data: faq,
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

/**
 * Retrieve all FAQs (ordered)
 */
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

/**
 * Delete an FAQ and re-normalize order
 */
export const deleteFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await Faq.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({
        status: "error",
        message: "FAQ not found.",
      });
      return;
    }

    // Shift others up
    await Faq.updateMany(
      { order: { $gt: deleted.order ?? 0 } },
      { $inc: { order: -1 } }
    );

    // Normalize after delete
    await normalizeFaqOrder();

    await chatbotService.removeSource("faq", id);

    res.status(200).json({
      status: "success",
      message: "FAQ deleted successfully.",
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
