import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import type { Nodes } from "mdast";
const blocks = new Set([
  "root",
  "list",
  "listItem",
  "blockquote",
  "table",
  "tableRow",
]);
function text(node: Nodes): string {
  return "children" in node && blocks.has(node.type)
    ? node.children.map(text).join(" ")
    : toString(node);
}
export function noteSummary(body: string): string {
  return [
    ...text(fromMarkdown(body.slice(0, 4096)))
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, 180)
    .join("");
}
