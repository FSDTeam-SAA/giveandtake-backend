import { Request, Response } from "express";
import slugify from "slugify";
import Content, {
  IContent,
  BUILT_IN_CONTENT_DEFAULTS,
  BuiltInContentType,
  isBuiltInContentType,
  normalizeContentType,
} from "../models/Content";
import chatbotService from "../services/chatbot.service";

const isBuiltIn = (type: unknown): boolean => isBuiltInContentType(type);

/**
 * Re-index a page for the chatbot without blocking the response.
 *
 * The embedding call goes out to a third-party model API. When that is slow,
 * rate-limited or misconfigured it used to reject *after* the page had already
 * been written, so the admin saw "Failed to save" for a save that had in fact
 * succeeded. Indexing is best-effort; the content write is what matters.
 */
const syncChatbotInBackground = (contentId: string): void => {
  void chatbotService.syncSingleContent(contentId).catch((error) => {
    console.error(
      `[content] chatbot re-index failed for ${contentId} (content was saved):`,
      error
    );
  });
};

const removeChatbotSourceInBackground = (contentId: string): void => {
  void chatbotService.removeSource("content", contentId).catch((error) => {
    console.error(
      `[content] chatbot cleanup failed for ${contentId} (page was deleted):`,
      error
    );
  });
};

/**
 * Fills in fields that legacy documents predate, so every client sees the same
 * shape no matter which database (or vintage of it) is being served.
 */
const presentContent = (doc: IContent) => {
  const plain = doc.toObject ? doc.toObject() : (doc as unknown as IContent);
  const type = normalizeContentType(plain.type);
  return {
    ...plain,
    type,
    isSystem: isBuiltIn(type) ? true : Boolean(plain.isSystem),
    published: typeof plain.published === "boolean" ? plain.published : true,
  };
};

/** Derives a unique slug, ignoring `excludeId` when re-slugging an existing page. */
const buildUniqueSlug = async (
  desired: string,
  fallback: string,
  excludeId?: string
): Promise<string> => {
  const base =
    slugify(desired, { lower: true, strict: true }) || fallback || `page-${Date.now()}`;

  let unique = base;
  let counter = 1;
  for (;;) {
    const clash = await Content.exists(
      excludeId
        ? { type: unique, _id: { $ne: excludeId } }
        : { type: unique }
    );
    if (!clash) return unique;
    unique = `${base}-${counter++}`;
  }
};

/**
 * Create or update a page by `type`. Used by the admin dashboard for the six
 * built-in pages, which are addressed by their fixed slug rather than by id so
 * that the same request works against a database where the page does not exist
 * yet. Built-in types are flagged `isSystem` so they cannot be deleted.
 */
export const upsertContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, published } = req.body as Partial<IContent>;
    const type = normalizeContentType((req.body as Partial<IContent>).type);

    if (!type || !title?.trim()) {
      res.status(400).json({
        status: "error",
        message: "type and title are required",
      });
      return;
    }

    const builtIn = isBuiltIn(type);

    // Only built-in pages may be addressed by slug. Custom pages go through
    // the id-based endpoint, so a typo here can never clobber someone's page
    // or quietly mint a new one.
    if (!builtIn) {
      const exists = await Content.exists({ type });
      if (!exists) {
        res.status(404).json({
          status: "error",
          message:
            "That page does not exist. Use Create New Page to add a new one.",
        });
        return;
      }
    }

    const update: Partial<IContent> = {
      title: title.trim(),
      description: description ?? "",
      isSystem: builtIn,
    };
    if (typeof published === "boolean") update.published = published;

    // `type` comes from the filter on insert, so it must not also appear in the
    // update document or Mongo reports a conflicting path.
    const content = await Content.findOneAndUpdate(
      { type },
      { $set: update },
      { new: true, upsert: builtIn, setDefaultsOnInsert: true }
    );

    if (!content) {
      res.status(404).json({ status: "error", message: "Page not found" });
      return;
    }

    syncChatbotInBackground(content.id);

    res.status(200).json({
      status: "success",
      message: "Content saved successfully.",
      data: presentContent(content),
    });
  } catch (error: any) {
    console.error("[content] upsert failed:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

/**
 * Create a brand-new dynamic page. The slug is derived from an explicit `slug`
 * or the title, made unique, and stored as the page `type`.
 */
export const createContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, slug, published } = req.body as {
      title?: string;
      description?: string;
      slug?: string;
      published?: boolean;
    };

    if (!title?.trim()) {
      res.status(400).json({ status: "error", message: "title is required" });
      return;
    }

    // A new page must not squat on a built-in slug — the built-in route would
    // shadow it and the page would be permanently unreachable.
    const requested = normalizeContentType(slug || title);
    if (isBuiltIn(requested)) {
      res.status(409).json({
        status: "error",
        message: `"${requested}" is reserved for a built-in page. Please choose a different web address.`,
      });
      return;
    }

    const uniqueSlug = await buildUniqueSlug(slug || title, `page-${Date.now()}`);

    const content = await Content.create({
      type: uniqueSlug,
      title: title.trim(),
      description: description ?? "",
      isSystem: false,
      published: typeof published === "boolean" ? published : true,
    });

    syncChatbotInBackground(content.id);

    res.status(201).json({
      status: "success",
      message: "Page created successfully.",
      data: presentContent(content),
    });
  } catch (error: any) {
    console.error("[content] create failed:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

/**
 * Update an existing page by id. The slug (`type`) of built-in pages is locked;
 * custom pages may be renamed/re-slugged as long as the new slug stays unique.
 */
export const updateContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, slug, published, expectedType } = req.body as {
      title?: string;
      description?: string;
      slug?: string;
      published?: boolean;
      expectedType?: string;
    };

    const content = await Content.findById(id);
    if (!content) {
      res.status(404).json({ status: "error", message: "Page not found" });
      return;
    }

    /**
     * The dashboard sends the slug it believes it is editing. If that does not
     * match the document behind this id, the client's view has drifted out of
     * sync and writing would overwrite the wrong page — refuse instead.
     */
    if (
      expectedType &&
      normalizeContentType(expectedType) !== normalizeContentType(content.type)
    ) {
      res.status(409).json({
        status: "error",
        message:
          "This page changed since you opened it. Please refresh and try again.",
      });
      return;
    }

    if (typeof title === "string" && title.trim()) content.title = title.trim();
    if (typeof description === "string") content.description = description;
    if (typeof published === "boolean") content.published = published;

    // Built-in pages are served from fixed routes, so their slug is immutable.
    // Checked against the slug list rather than the stored `isSystem` flag,
    // which legacy documents may be missing entirely.
    const builtIn = isBuiltIn(content.type);
    if (builtIn) content.isSystem = true;

    if (slug && !builtIn) {
      const requested = normalizeContentType(slug);
      if (isBuiltIn(requested)) {
        res.status(409).json({
          status: "error",
          message: `"${requested}" is reserved for a built-in page. Please choose a different web address.`,
        });
        return;
      }
      content.type = await buildUniqueSlug(slug, content.type, content.id);
    }

    await content.save();

    syncChatbotInBackground(content.id);

    res.status(200).json({
      status: "success",
      message: "Page updated successfully.",
      data: presentContent(content),
    });
  } catch (error: any) {
    console.error("[content] update failed:", error);
    res.status(500).json({ status: "error", message: error.message });
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
      res.status(404).json({ status: "error", message: "Page not found" });
      return;
    }

    if (isBuiltIn(content.type)) {
      res
        .status(403)
        .json({ status: "error", message: "System pages cannot be deleted." });
      return;
    }

    const deletedId = content.id;
    await content.deleteOne();
    removeChatbotSourceInBackground(deletedId);

    res.status(200).json({
      status: "success",
      message: "Page deleted successfully.",
      data: null,
    });
  } catch (error: any) {
    console.error("[content] delete failed:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

export const getAllContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const stored = await Content.find().sort({ isSystem: -1, createdAt: 1 });
    const byType = new Map(
      stored.map((doc) => [normalizeContentType(doc.type), presentContent(doc)])
    );

    /**
     * Guarantee the six built-ins are always in the list, even on a database
     * where the seed has not run yet. The dashboard can then render and save
     * them without special-casing "this page has no document".
     */
    const builtIns = (
      Object.keys(BUILT_IN_CONTENT_DEFAULTS) as BuiltInContentType[]
    ).map(
      (type) =>
        byType.get(type) ?? {
          type,
          title: BUILT_IN_CONTENT_DEFAULTS[type],
          description: "",
          isSystem: true,
          published: true,
        }
    );

    const custom = [...byType.values()].filter((doc) => !isBuiltIn(doc.type));

    res.status(200).json({
      status: "success",
      message: "Content retrieved successfully.",
      data: [...builtIns, ...custom],
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error retrieving content.";
    console.error("[content] list failed:", err);

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
    // `published` is absent on documents written before the field existed;
    // those pages were live at the time and must stay live.
    const content = await Content.find({ published: { $ne: false } })
      .select("type title isSystem createdAt updatedAt published")
      .sort({ isSystem: -1, createdAt: 1 });

    res.status(200).json({
      status: "success",
      message: "Published content retrieved successfully.",
      data: content.map(presentContent),
    });
  } catch (error: any) {
    console.error("[content] published list failed:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

export const getContentByType = async (req: Request, res: Response): Promise<void> => {
  try {
    const type = normalizeContentType(req.params.type);
    const content = await Content.findOne({ type });

    if (!content) {
      // A built-in page that has not been written yet still resolves, so the
      // website renders its heading instead of erroring.
      if (isBuiltIn(type)) {
        res.status(200).json({
          status: "success",
          message: "Content retrieved successfully.",
          data: {
            type,
            title: BUILT_IN_CONTENT_DEFAULTS[type as BuiltInContentType],
            description: "",
            isSystem: true,
            published: true,
          },
        });
        return;
      }

      res.status(404).json({ status: "error", message: "Content not found" });
      return;
    }

    res.status(200).json({
      status: "success",
      message: "Content retrieved successfully.",
      data: presentContent(content),
    });
  } catch (error: any) {
    console.error("[content] fetch by type failed:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};
