import type { AttachmentStorage } from "../../platform/contracts";
import { useId, useMemo, useRef, useState } from "react";
import type { Dictionary } from "../../shared/i18n/en";
import type { EditorSession, EditorSnapshot } from "./session";
import { MarkdownView, headings } from "./MarkdownView";
import { EditorDock, type EditorMode } from "./EditorDock";
import { formatMarkdown, type MarkdownFormat } from "./markdownFormat";
import { Notice } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";
import "./editor.css";

export function NoteEditor({
  editor,
  session,
  busy,
  t,
  message,
  onSaveCopy,
  onHistory,
  onAttach,
  actionsDisabled = busy,
  attachments,
}: {
  editor: EditorSnapshot;
  session: EditorSession;
  busy: boolean;
  t: Dictionary;
  message: (error: unknown) => string;
  onSaveCopy: () => void;
  onHistory?: () => void;
  onAttach?: () => void;
  actionsDisabled?: boolean;
  attachments?: AttachmentStorage;
}) {
  const [mode, setMode] = useState<EditorMode>("edit");
  const id = useId();
  const panelId = `${id}-panel`;
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const outline = useMemo(
    () => (mode === "outline" ? headings(editor.body) : []),
    [editor.body, mode],
  );
  function format(kind: MarkdownFormat) {
    const input = editorRef.current;
    if (!input || busy) return;
    const edit = formatMarkdown(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      kind,
    );
    input.focus();
    input.setSelectionRange(edit.from, edit.to);
    // insertText keeps the change on the native undo stack; fall back when unsupported.
    const inserted =
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, edit.text);
    if (
      !inserted ||
      input.value.slice(edit.from, edit.from + edit.text.length) !== edit.text
    ) {
      const value =
        input.value.slice(0, edit.from) +
        edit.text +
        input.value.slice(edit.to);
      session?.edit(value);
    }
    requestAnimationFrame(() =>
      editorRef.current?.setSelectionRange(
        edit.selectionStart,
        edit.selectionEnd,
      ),
    );
  }
  return (
    <div className="note-editor-layout">
      {editor.status === "error" && (
        <Notice tone="danger">
          <div>
            <p>{message(editor.error)}</p>
            <p>{t.draftSafe}</p>
            <Button onClick={() => void session?.flush().catch(() => {})}>
              {t.retry}
            </Button>
            <Button onClick={() => onSaveCopy()}>{t.saveCopy}</Button>
          </div>
        </Notice>
      )}
      <div
        className="editor-panel"
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${id}-${mode}`}
      >
        {mode === "edit" ? (
          <textarea
            ref={editorRef}
            className="note-editor"
            aria-label={t.editor}
            placeholder={t.editorPlaceholder}
            value={editor.body}
            disabled={busy}
            onChange={(e) => session?.edit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void session?.flush().catch(() => {});
              }
            }}
            spellCheck
          />
        ) : mode === "preview" ? (
          <div className="preview-pane">
            <MarkdownView
              body={editor.body}
              empty={t.emptyPreview}
              notePath={editor.note?.path}
              attachments={attachments}
            />
          </div>
        ) : (
          <div className="outline-pane">
            {outline.length ? (
              <ol>
                {outline.map((item, index) => (
                  <li
                    key={index}
                    style={{
                      paddingInlineStart: `${(item.level - 1) * 12}px`,
                    }}
                  >
                    <Button
                      onClick={() => {
                        setMode("edit");
                        setTimeout(() => {
                          const input = editorRef.current;
                          if (!input) return;
                          const start =
                            editor.body
                              .split("\n")
                              .slice(0, item.line - 1)
                              .join("\n").length + (item.line > 1 ? 1 : 0);
                          input.focus();
                          input.setSelectionRange(start, start);
                        }, 0);
                      }}
                    >
                      {item.text}
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="editor-empty-outline">{t.noHeadings}</p>
            )}
          </div>
        )}
      </div>
      <EditorDock
        mode={mode}
        onMode={setMode}
        t={t}
        panelId={panelId}
        tabsId={id}
        onHistory={onHistory}
        onAttach={onAttach}
        onFormat={format}
        disabled={actionsDisabled}
        formatDisabled={busy}
        path={editor.note?.path ?? ""}
        characters={[...editor.body].length}
      />
    </div>
  );
}
