import { toPng } from "html-to-image";

// A4 portrait target width at 300dpi
const A4_WIDTH_PX = 2480;

export async function exportAsA4Png(element: HTMLElement, filename: string, compact = false) {
  let target: HTMLElement;
  let clone: HTMLElement | null = null;

  if (compact) {
    // Build a compact clone: fit-content width, tight cell padding, no stretched tables
    clone = element.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      "position:absolute;top:-99999px;left:0;width:max-content;background:#fff;";

    for (const cell of clone.querySelectorAll("th, td")) {
      const el = cell as HTMLElement;
      el.style.padding = "5px 14px";
      el.style.whiteSpace = "nowrap";
    }
    for (const table of clone.querySelectorAll("table")) {
      const el = table as HTMLElement;
      el.classList.remove("w-full");
      el.style.width = "auto";
    }

    document.body.appendChild(clone);
    // Let browser compute natural layout
    await new Promise<void>(r => setTimeout(r, 80));
    target = clone;
  } else {
    target = element;
  }

  try {
    const ratio = compact ? 3 : A4_WIDTH_PX / element.offsetWidth;

    const dataUrl = await toPng(target, {
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
    if (clone) document.body.removeChild(clone);
  }
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
