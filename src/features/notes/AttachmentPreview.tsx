import { useEffect, useState } from "react";
import type {
  AttachmentContent,
  AttachmentStorage,
} from "../../platform/contracts";
export function AttachmentPreview({
  note,
  url,
  alt,
  storage,
}: {
  note: string;
  url: string;
  alt: string;
  storage: AttachmentStorage;
}) {
  const [content, setContent] = useState<AttachmentContent | null>(null);
  useEffect(() => {
    let active = true;
    let content: AttachmentContent | null = null;
    setContent(null);
    void storage.read(note, url).then(
      (value) => {
        if (!active) value.release();
        else {
          content = value;
          setContent(value);
        }
      },
      () => {},
    );
    return () => {
      active = false;
      content?.release();
    };
  }, [note, url, storage]);
  return content?.mime.startsWith("image/") ? (
    <img src={content.url} alt={alt} loading="lazy" />
  ) : (
    <span className="attachment-placeholder">[{alt}]</span>
  );
}
