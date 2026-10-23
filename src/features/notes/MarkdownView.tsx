import { AttachmentLink, isOwnedAttachment } from "./AttachmentLink";
import type { AttachmentStorage } from "../../platform/contracts";
import { AttachmentPreview } from "./AttachmentPreview";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function MarkdownView({
  body,
  empty,
  notePath,
  attachments,
  unavailable = empty,
}: {
  body: string;
  empty: string;
  notePath?: string;
  attachments?: AttachmentStorage;
  unavailable?: string;
}) {
  if (!body.trim()) return <p className="empty-preview">{empty}</p>;
  return (
    <article className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) =>
            notePath &&
            attachments &&
            href &&
            isOwnedAttachment(notePath, href) ? (
              <AttachmentLink
                note={notePath}
                url={href}
                storage={attachments}
                unavailable={unavailable}
              >
                {children}
              </AttachmentLink>
            ) : (
              <span className="preview-link" title={href}>
                {children}
              </span>
            ),
          img: ({ alt, src }) =>
            notePath && attachments && src ? (
              <AttachmentPreview
                note={notePath}
                url={src}
                alt={alt ?? ""}
                storage={attachments}
              />
            ) : (
              <span className="attachment-placeholder">[{alt ?? ""}]</span>
            ),
        }}
      >
        {body}
      </Markdown>
    </article>
  );
}
export function headings(
  body: string,
): { level: number; text: string; line: number }[] {
  return fromMarkdown(body).children.flatMap((node) =>
    node.type === "heading"
      ? [
          {
            level: node.depth,
            text: toString(node),
            line: node.position?.start.line ?? 1,
          },
        ]
      : [],
  );
}
