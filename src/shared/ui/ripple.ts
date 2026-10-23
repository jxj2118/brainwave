const pressable = ".bw-pressable";
const minimumVisible = 260;

export function installRipple(root: Document): () => void {
  const reducedMotion = root.defaultView?.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  function spawn(target: HTMLElement, x?: number, y?: number) {
    if (reducedMotion?.matches) return;
    const rect = target.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    const wave = root.createElement("span");
    wave.className = "bw-ripple";
    wave.setAttribute("aria-hidden", "true");
    wave.style.width = wave.style.height = `${size}px`;
    wave.style.left = `${(x ?? rect.left + rect.width / 2) - rect.left - size / 2}px`;
    wave.style.top = `${(y ?? rect.top + rect.height / 2) - rect.top - size / 2}px`;
    target.append(wave);
    const born = performance.now();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const wait = Math.max(0, minimumVisible - (performance.now() - born));
      setTimeout(() => {
        wave.classList.add("is-released");
        wave.addEventListener("transitionend", () => wave.remove(), {
          once: true,
        });
        setTimeout(() => wave.remove(), 600);
      }, wait);
    };
  }
  function find(event: Event): HTMLElement | null {
    const target = (event.target as Element | null)?.closest?.(pressable);
    if (!(target instanceof HTMLElement)) return null;
    if (target.matches(":disabled, [aria-disabled='true']")) return null;
    return target;
  }
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = find(event);
    if (!target) return;
    const release = spawn(target, event.clientX, event.clientY);
    if (!release) return;
    const done = () => {
      release();
      root.removeEventListener("pointerup", done);
      root.removeEventListener("pointercancel", done);
      target.removeEventListener("pointerleave", done);
    };
    root.addEventListener("pointerup", done);
    root.addEventListener("pointercancel", done);
    target.addEventListener("pointerleave", done);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    const target = find(event);
    if (target && target === event.target) spawn(target)?.();
  }
  root.addEventListener("pointerdown", onPointerDown, { passive: true });
  root.addEventListener("keydown", onKeyDown);
  return () => {
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("keydown", onKeyDown);
  };
}
