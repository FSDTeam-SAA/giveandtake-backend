import Content, {
  BUILT_IN_CONTENT_DEFAULTS,
  BUILT_IN_CONTENT_TYPES,
  BuiltInContentType,
} from "../models/Content";

/**
 * Makes the six built-in pages exist and be well-formed in whatever database
 * the process is pointed at. Each environment (local, staging, production) has
 * its own MongoDB, and the collection was originally written before `isSystem`
 * and `published` existed, so documents differ between them. Running this on
 * every boot means the admin dashboard behaves identically everywhere without
 * anyone having to hand-patch a database.
 *
 * It is deliberately conservative: it only ever *adds* what is missing. An
 * existing title or body is never overwritten, so admin edits survive restarts.
 */
export const ensureBuiltInContent = async (): Promise<void> => {
  try {
    const existing = await Content.find({
      type: { $in: BUILT_IN_CONTENT_TYPES as unknown as string[] },
    }).select("type title isSystem published");

    const byType = new Map(existing.map((doc) => [doc.type, doc]));

    const created: string[] = [];
    const repaired: string[] = [];

    for (const type of BUILT_IN_CONTENT_TYPES) {
      const doc = byType.get(type);

      if (!doc) {
        // `upsert` rather than `create` so two instances booting at the same
        // time cannot race each other into a duplicate-key error.
        await Content.updateOne(
          { type },
          {
            $setOnInsert: {
              title: BUILT_IN_CONTENT_DEFAULTS[type as BuiltInContentType],
              description: "",
              isSystem: true,
              published: true,
            },
          },
          { upsert: true }
        );
        created.push(type);
        continue;
      }

      // Legacy documents predate these two fields. Without `isSystem` the page
      // is deletable and can have its slug rewritten; without `published` it
      // disappears from every `{ published: true }` query.
      const patch: Record<string, unknown> = {};
      if (doc.isSystem !== true) patch.isSystem = true;
      if (typeof doc.published !== "boolean") patch.published = true;
      if (!doc.title?.trim()) {
        patch.title = BUILT_IN_CONTENT_DEFAULTS[type as BuiltInContentType];
      }

      if (Object.keys(patch).length) {
        await Content.updateOne({ _id: doc._id }, { $set: patch });
        repaired.push(type);
      }
    }

    // Any page that is *not* built-in must not claim to be a system page, or
    // the dashboard would refuse to let an admin delete their own page.
    const demoted = await Content.updateMany(
      {
        type: { $nin: BUILT_IN_CONTENT_TYPES as unknown as string[] },
        isSystem: true,
      },
      { $set: { isSystem: false } }
    );

    // Custom pages created before `published` existed would 404 on the site.
    const publishedBackfill = await Content.updateMany(
      { published: { $exists: false } },
      { $set: { published: true } }
    );

    if (
      created.length ||
      repaired.length ||
      demoted.modifiedCount ||
      publishedBackfill.modifiedCount
    ) {
      console.log(
        `[content] built-ins ready — created: [${created.join(", ")}], ` +
          `repaired: [${repaired.join(", ")}], ` +
          `demoted: ${demoted.modifiedCount}, ` +
          `published backfilled: ${publishedBackfill.modifiedCount}`
      );
    }
  } catch (error) {
    // Never take the API down over this; the dashboard still works and the
    // next boot will retry.
    console.error("[content] failed to ensure built-in pages:", error);
  }
};

export default ensureBuiltInContent;
