import { useEffect, useState } from "react";
import type { Entry, NoteStorage } from "../../platform/contracts";
import { noteSummary } from "./noteSummary";
export function useNoteSummaries(storage: NoteStorage, entries: Entry[]) {
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const notes = entries
      .filter((e) => e.kind === "note" && !e.issue)
      .slice(0, 24);
    let next = 0;
    const result: Record<string, string> = {};
    async function worker() {
      while (active && next < notes.length) {
        const entry = notes[next++];
        try {
          const note = await storage.readNote(entry.path);
          result[entry.path] = noteSummary(note.body);
        } catch {
          /* A preview must not prevent opening a readable file. */
        }
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(4, notes.length) }, () => worker()),
    ).then(() => {
      if (active) setSummaries(result);
    });
    return () => {
      active = false;
    };
  }, [storage, entries]);
  return summaries;
}
