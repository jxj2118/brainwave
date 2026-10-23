import type { Dictionary } from "../../shared/i18n/en";
import type { IconName } from "../../shared/Icon";
import { Icon } from "../../shared/Icon";
import { Button, IconButton } from "../../shared/ui/Button";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import type { MarkdownFormat } from "./markdownFormat";
export type EditorMode = "edit" | "preview" | "outline";
const formats: readonly { kind: MarkdownFormat; icon: IconName }[] = [
  { kind: "heading", icon: "heading" },
  { kind: "bulletList", icon: "bulletList" },
  { kind: "taskList", icon: "taskList" },
  { kind: "code", icon: "code" },
  { kind: "link", icon: "link" },
  { kind: "quote", icon: "quote" },
];
export function EditorDock({
  mode,
  onMode,
  t,
  panelId,
  tabsId,
  onHistory,
  onAttach,
  onFormat,
  disabled,
  formatDisabled,
  path,
  characters,
}: {
  mode: EditorMode;
  onMode(mode: EditorMode): void;
  t: Dictionary;
  panelId: string;
  tabsId: string;
  onHistory?: () => void;
  onAttach?: () => void;
  onFormat(kind: MarkdownFormat): void;
  disabled: boolean;
  formatDisabled: boolean;
  path: string;
  characters: number;
}) {
  return (
    <div className="editor-dock">
      <div className="editor-dock-modes">
        <SegmentedControl
          id={tabsId}
          panelId={panelId}
          label={t.openNote}
          value={mode}
          onChange={onMode}
          options={[
            { value: "edit", label: t.edit, icon: "edit" },
            { value: "preview", label: t.preview, icon: "eye" },
            { value: "outline", label: t.outline, icon: "outline" },
          ]}
        />
        {onHistory && (
          <Button
            className="editor-history-action"
            variant="ghost"
            disabled={disabled}
            onClick={onHistory}
          >
            <Icon name="history" size={18} />
            {t.history}
          </Button>
        )}
      </div>
      <div className="editor-dock-tools">
        {onAttach && (
          <IconButton
            className="editor-attach-action"
            label={t.addAttachment}
            icon="attachment"
            disabled={disabled}
            onClick={onAttach}
          />
        )}
        {mode === "edit" && (
          <div
            className="editor-format"
            role="toolbar"
            aria-label={t.formatting}
          >
            {formats.map(({ kind, icon }) => (
              <IconButton
                key={kind}
                label={t.format[kind]}
                icon={icon}
                disabled={formatDisabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onFormat(kind)}
              />
            ))}
          </div>
        )}
        <span className="editor-document-info" title={path}>
          {characters} {t.characters}
        </span>
      </div>
    </div>
  );
}
