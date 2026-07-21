import { Request, Response } from "express";
import slugify from "slugify";
import Content, { IContent, BUILT_IN_CONTENT_TYPES } from "../models/Content";
import chatbotService from "../services/chatbot.service";

const isBuiltIn = (type: string): boolean =>
  (BUILT_IN_CONTENT_TYPES as readonly string[]).includes(type);

/**
 * Create or update a page by `type`. Used by the admin dashboard both for the
 * built-in pages (about, privacy, …) and as a convenience upsert. Built-in
 * types are automatically flagged `isSystem` so they cannot be deleted.
 */
export const upsertContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, title, description, published, showInFooter } =
      req.body as Partial<IContent>;

    if (!type || !title) {
      res.status(400).json({ message: "type and title are required" });
      return;
    }

    const update: Partial<IContent> = { title, description: description ?? "" };
    if (typeof published === "boolean") update.published = published;
    if (typeof showInFooter === "boolean") update.showInFooter = showInFooter;
    if (isBuiltIn(type)) update.isSystem = true;

    const content = await Content.findOneAndUpdate({ type }, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    if (content?.id) {
      await chatbotService.syncSingleContent(content.id);
    }

    res.status(200).json({
      status: "success",
      message: "Content saved successfully.",
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Create a brand-new dynamic page. The slug is derived from an explicit `slug`
 * or the title, made unique, and stored as the page `type`.
 */
export const createContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, slug, published, showInFooter } = req.body as {
      title?: string;
      description?: string;
      slug?: string;
      published?: boolean;
      showInFooter?: boolean;
    };

    if (!title || !description) {
      res.status(400).json({ message: "title and description are required" });
      return;
    }

    const baseSlug =
      slugify(slug || title, { lower: true, strict: true }) ||
      `page-${Date.now()}`;

    let uniqueSlug = baseSlug;
    let counter = 1;
    while (await Content.exists({ type: uniqueSlug })) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    const content = await Content.create({
      type: uniqueSlug,
      title,
      description,
      isSystem: false,
      published: typeof published === "boolean" ? published : true,
      showInFooter: Boolean(showInFooter),
    });

    if (content?.id) {
      await chatbotService.syncSingleContent(content.id);
    }

    res.status(201).json({
      status: "success",
      message: "Page created successfully.",
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Update an existing page by id. The slug (`type`) of built-in pages is locked;
 * custom pages may be renamed/re-slugged as long as the new slug stays unique.
 */
export const updateContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, slug, published, showInFooter } = req.body as {
      title?: string;
      description?: string;
      slug?: string;
      published?: boolean;
      showInFooter?: boolean;
    };

    const content = await Content.findById(id);
    if (!content) {
      res.status(404).json({ message: "Page not found" });
      return;
    }

    if (typeof title === "string") content.title = title;
    if (typeof description === "string") content.description = description;
    if (typeof published === "boolean") content.published = published;
    if (typeof showInFooter === "boolean") content.showInFooter = showInFooter;

    // Allow re-slugging only for custom pages.
    if (slug && !content.isSystem) {
      const baseSlug =
        slugify(slug, { lower: true, strict: true }) || content.type;
      let uniqueSlug = baseSlug;
      let counter = 1;
      while (await Content.exists({ type: uniqueSlug, _id: { $ne: content.id } })) {
        uniqueSlug = `${baseSlug}-${counter++}`;
      }
      content.type = uniqueSlug;
    }

    await content.save();

    if (content?.id) {
      await chatbotService.syncSingleContent(content.id);
    }

    res.status(200).json({
      status: "success",
      message: "Page updated successfully.",
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Delete a custom page by id. Built-in/system pages are protected.
 */
export const deleteContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const content = await Content.findById(id);

    if (!content) {
      res.status(404).json({ message: "Page not found" });
      return;
    }

    if (content.isSystem || isBuiltIn(content.type)) {
      res.status(403).json({ message: "System pages cannot be deleted." });
      return;
    }

    await content.deleteOne();
    await chatbotService.removeSource("content", content.id);

    res.status(200).json({
      status: "success",
      message: "Page deleted successfully.",
      data: null,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const content = await Content.find().sort({ isSystem: -1, createdAt: 1 });

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

/**
 * Public list of published pages, used to render footer / navigation links.
 */
export const getPublishedContent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const content = await Content.find({ published: true })
      .select("type title showInFooter isSystem")
      .sort({ isSystem: -1, createdAt: 1 });

    res.status(200).json({
      status: "success",
      message: "Published content retrieved successfully.",
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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
