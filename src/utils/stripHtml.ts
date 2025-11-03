import { htmlToText } from "html-to-text";

export const stripHtml = (html: string): string =>
  htmlToText(html ?? "", {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
    ],
    preserveNewlines: true,
  }).replace(/\n{3,}/g, "\n\n") // collapse excessive blank lines
    .trim();

export default stripHtml;
