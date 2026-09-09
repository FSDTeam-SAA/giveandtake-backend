import { Request, Response } from "express";
import ScrollingInfo, {
  DEFAULT_SCROLLING_INFO,
  IScrollingInfoGroup,
  SCROLLING_INFO_KEY,
  SCROLLING_INFO_ROLES,
  ScrollingInfoRole,
} from "../models/ScrollingInfo";

const cloneDefaults = () => ({
  enabled: DEFAULT_SCROLLING_INFO.enabled,
  speedSeconds: DEFAULT_SCROLLING_INFO.speedSeconds,
  groups: DEFAULT_SCROLLING_INFO.groups.map((group) => ({
    role: group.role,
    buttonText: group.buttonText,
    texts: [...group.texts],
  })),
});

export const getScrollingInfo = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const settings = await ScrollingInfo.findOne({ key: SCROLLING_INFO_KEY }).lean();
    res.status(200).json({
      status: "success",
      message: "Scrolling bar settings retrieved successfully.",
      data: settings ?? cloneDefaults(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load settings.";
    res.status(500).json({ status: "error", message });
  }
};

const normaliseGroups = (value: unknown): IScrollingInfoGroup[] | null => {
  if (!Array.isArray(value) || value.length !== SCROLLING_INFO_ROLES.length) return null;

  const seen = new Set<string>();
  const groups: IScrollingInfoGroup[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Record<string, unknown>;
    const role = candidate.role as ScrollingInfoRole;
    const buttonText = typeof candidate.buttonText === "string" ? candidate.buttonText.trim() : "";
    if (
      !SCROLLING_INFO_ROLES.includes(role) ||
      seen.has(role) ||
      !buttonText ||
      buttonText.length > 80 ||
      !Array.isArray(candidate.texts) ||
      candidate.texts.length > 100
    ) {
      return null;
    }

    const texts = candidate.texts
      .filter((text): text is string => typeof text === "string")
      .map((text) => text.trim())
      .filter(Boolean);
    if (texts.some((text) => text.length > 200)) return null;

    seen.add(role);
    groups.push({ role, buttonText, texts });
  }

  return SCROLLING_INFO_ROLES.map((role) => groups.find((group) => group.role === role)!);
};

export const updateScrollingInfo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const groups = normaliseGroups(req.body.groups);
    const speedSeconds = Number(req.body.speedSeconds);
    if (
      typeof req.body.enabled !== "boolean" ||
      !Number.isFinite(speedSeconds) ||
      speedSeconds < 10 ||
      speedSeconds > 300 ||
      !groups
    ) {
      res.status(400).json({
        status: "error",
        message: "Invalid scrolling bar settings.",
      });
      return;
    }

    const settings = await ScrollingInfo.findOneAndUpdate(
      { key: SCROLLING_INFO_KEY },
      {
        $set: {
          enabled: req.body.enabled,
          speedSeconds,
          groups,
        },
        $setOnInsert: { key: SCROLLING_INFO_KEY },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      status: "success",
      message: "Scrolling bar updated successfully.",
      data: settings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save settings.";
    res.status(500).json({ status: "error", message });
  }
};
