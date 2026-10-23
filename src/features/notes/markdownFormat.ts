export type MarkdownFormat =
  "heading" | "bulletList" | "taskList" | "quote" | "code" | "link";
export type MarkdownEdit = {
  from: number;
  to: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

const linePrefixes = {
  bulletList: { match: /^- (?!\[[ xX]\] )/, insert: "- " },
  taskList: { match: /^- \[[ xX]\] /, insert: "- [ ] " },
  quote: { match: /^> ?/, insert: "> " },
} as const;

export function formatMarkdown(
  body: string,
  start: number,
  end: number,
  kind: MarkdownFormat,
): MarkdownEdit {
  if (kind === "code" || kind === "link") return wrap(body, start, end, kind);
  const from = body.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = body.indexOf("\n", Math.max(start, end - 1));
  const to = lineEnd === -1 ? body.length : lineEnd;
  const lines = body.slice(from, to).split("\n");
  let next: string[];
  if (kind === "heading") {
    next = lines.map((line) => {
      const level = /^(#{1,6}) /.exec(line)?.[1].length ?? 0;
      const text = line.replace(/^#{1,6} /, "");
      return level >= 3 ? text : `${"#".repeat(level + 1)} ${text}`;
    });
  } else {
    const { match, insert } = linePrefixes[kind];
    const active = lines.every((line) => !line.trim() || match.test(line));
    next = lines.map((line) =>
      active
        ? line.replace(match, "")
        : line.trim() || lines.length === 1
          ? insert + line.replace(/^(- \[[ xX]\] |- |> ?)/, "")
          : line,
    );
  }
  const text = next.join("\n");
  const caret = from + text.length;
  return {
    from,
    to,
    text,
    selectionStart: start === end ? caret : from,
    selectionEnd: caret,
  };
}

function wrap(
  body: string,
  start: number,
  end: number,
  kind: "code" | "link",
): MarkdownEdit {
  const selected = body.slice(start, end);
  if (kind === "link") {
    const prefix = `[${selected}](`;
    return {
      from: start,
      to: end,
      text: `${prefix}https://)`,
      selectionStart: start + prefix.length,
      selectionEnd: start + prefix.length + "https://".length,
    };
  }
  if (selected.includes("\n") || (!selected && isBlankLine(body, start))) {
    const text = "```\n" + selected + "\n```";
    return {
      from: start,
      to: end,
      text,
      selectionStart: start + 4,
      selectionEnd: start + 4 + selected.length,
    };
  }
  return {
    from: start,
    to: end,
    text: "`" + selected + "`",
    selectionStart: start + 1,
    selectionEnd: start + 1 + selected.length,
  };
}

function isBlankLine(body: string, index: number): boolean {
  const from = body.lastIndexOf("\n", index - 1) + 1;
  const to = body.indexOf("\n", index);
  return !body.slice(from, to === -1 ? body.length : to).trim();
}
