export const QUICK_NOTE_FOLDER = "Inbox";
export const QUICK_NOTE_ATTEMPTS = 20;
const MAX_NAME = 60;
const MARKERS =
  /^(?:#{1,6}\s*|>\s*|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)+/u;
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/gu;
const EDGES = /^[.\s]+|[.\s]+$/gu;

const pad = (value: number) => String(value).padStart(2, "0");

/** File name (without `.md`) for a quick note: its first non-empty line, else a timestamp. */
export function quickNoteName(
  text: string,
  now: Date,
  fallbackPrefix: string,
): string {
  const line = text.split(/\r?\n/u).find((value) => value.trim()) ?? "";
  const cleaned = line
    .trim()
    .replace(MARKERS, "")
    .replace(FORBIDDEN, " ")
    .replace(/\s+/gu, " ")
    .replace(EDGES, "");
  const name = [...cleaned].slice(0, MAX_NAME).join("").replace(EDGES, "");
  if (name) return name;
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${fallbackPrefix} ${date} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export function withSuffix(name: string, attempt: number): string {
  return attempt <= 1 ? name : `${name} ${attempt}`;
}
