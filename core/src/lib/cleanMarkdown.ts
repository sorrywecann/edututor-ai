/**
 * Defensive markdown-artifact stripper for chat responses.
 *
 * The backend system prompts forbid markdown, but small models still leak
 * **bold**, ## headers, `code`, and "- item" bullets occasionally. The chat
 * components render content as plain text (no markdown parser installed),
 * so those artifacts show up literally. This utility removes the noise
 * while preserving citation markers ([Zdroj N] / [Source N]), line breaks,
 * numbered lists, emoji, math symbols, and ordinary punctuation.
 *
 * Conservative by design — never alters real content, only removes
 * markdown decoration.
 */
export function cleanMarkdown(text: string): string {
  if (!text) return text;

  let s = text;

  // 1) Strip bold wrappers, keep inner text. Lazy, single-line.
  //    Single-asterisk italic and single-underscore italic are intentionally
  //    NOT stripped — they false-positive on math ("2 * x * y") and
  //    identifiers ("snake_case_name"). Bold is the dominant LLM leakage.
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  s = s.replace(/__([^_\n]+?)__/g, "$1");

  // 2) Strip inline code backticks: `code` -> code
  s = s.replace(/`([^`\n]+?)`/g, "$1");

  // 3) Strip leading header hashes on their own line: "## Heading" -> "Heading"
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");

  // 4) Strip blockquote markers: "> text" -> "text"
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");

  // 5) Convert bullet-line markers ("-" / "*" / "+") at line start to "• ".
  //    Preserves indentation, leaves numbered lists alone, leaves the ✅
  //    emoji prefix used by the "akčné body" tool alone.
  s = s.replace(/^([ \t]*)[-*+][ \t]+/gm, "$1• ");

  // 6) Strip horizontal rule lines: "---", "***", "___" alone on a line.
  s = s.replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, "");

  // 7) Strip Markdown links: [text](url) -> text. Citation markers like
  //    "[Zdroj 1]" have no "(url)" suffix, so they pass through unchanged.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  // 8) Collapse 3+ consecutive newlines to 2 (one blank line between blocks).
  s = s.replace(/\n{3,}/g, "\n\n");

  return s;
}
