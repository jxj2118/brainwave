import type { AttachmentInput } from "./contracts";
const MAX = 20 * 1024 * 1024;
// File selection stays in the platform layer, including the WebView's native chooser.
export function pickAttachment(): Promise<AttachmentInput | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    document.body.append(input);
    let settled = false;
    const finish = (value: AttachmentInput | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener("focus", focused);
      if (error) reject(error);
      else resolve(value);
    };
    const focused = () =>
      setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 1200);
    input.addEventListener("cancel", () => finish(null), { once: true });
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) return finish(null);
        if (file.size > MAX)
          return finish(null, { code: "attachmentTooLarge" });
        void file.arrayBuffer().then(
          (bytes) => finish({ name: file.name, bytes: new Uint8Array(bytes) }),
          (error) => finish(null, error),
        );
      },
      { once: true },
    );
    window.addEventListener("focus", focused);
    input.click();
  });
}
export function attachmentBlob(bytes: number[], mime: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: mime }),
  );
  return { url, mime, release: () => URL.revokeObjectURL(url) };
}
