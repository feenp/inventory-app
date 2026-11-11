import { toPng } from "html-to-image";

// A4 portrait target width at 300dpi
const A4_WIDTH_PX = 2480;

export async function exportAsA4Png(element: HTMLElement, filename: string, compact = false) {
  // For compact mode: temporarily apply tight styles to the live element,
  // capture, then restore. The element must stay in the real DOM for
  // html-to-image to render it correctly.
  const saved: { el: HTMLElement; style: string }[] = [];

  const save = (el: HTMLElement) => saved.push({ el, style: el.style.cssText });

  if (compact) {
    // Container: shrink to content width
    save(element);
    element.style.width = "max-content";
    element.style.minWidth = "0";

    // Tables: auto width (overrides w-full / 100%)
    for (const table of element.querySelectorAll("table")) {
      const el = table as HTMLElement;
      save(el);
      el.style.width = "auto";
      el.style.minWidth = "0";
    }

    // Cells: tight padding, prevent wrapping
    for (const cell of element.querySelectorAll("th, td")) {
      const el = cell as HTMLElement;
      save(el);
      el.style.padding = "5px 14px";
      el.style.whiteSpace = "nowrap";
    }

    // Force layout recalculation before capture
    element.getBoundingClientRect();
  }

  try {
    const ratio = compact ? 3 : A4_WIDTH_PX / element.offsetWidth;

    const dataUrl = await toPng(element, {
      pixelRatio: ratio,
      backgroundColor: "#ffffff",
      style: { background: "#ffffff" },
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.exportHidden === "true") return false;
        return true;
      },
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } finally {
    // Always restore original styles
    for (const { el, style } of saved) {
      el.style.cssText = style;
    }
  }
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
