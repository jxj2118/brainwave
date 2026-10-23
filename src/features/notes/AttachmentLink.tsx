import { useState, type ReactNode } from "react";
import type { AttachmentStorage } from "../../platform/contracts";
export function isOwnedAttachment(note: string, url: string): boolean {
  try {
    const stem = note.split("/").at(-1)!.slice(0, -3) + ".assets/";
    const decoded = decodeURIComponent(url).replace(/^\.\//, "");
    return (
      decoded.startsWith(stem) &&
      !decoded.split("/").some((part) => part === ".." || part === ".")
    );
  } catch {
    return false;
  }
}
export function AttachmentLink({
  note,
  url,
  storage,
  children,
  unavailable,
}: {
  note: string;
  url: string;
  storage: AttachmentStorage;
  children: ReactNode;
  unavailable: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        className="attachment-link"
        title={url}
        onClick={() => {
          setFailed(false);
          void storage.open(note, url).catch(() => setFailed(true));
        }}
      >
        {children}
      </button>
      {failed && (
        <span role="alert" className="form-error">
          {unavailable}
        </span>
      )}
    </>
  );
}
