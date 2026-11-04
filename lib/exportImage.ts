import { toPng } from "html-to-image";

// A4 portrait target width at 300dpi
const A4_WIDTH_PX = 2480;

export async function exportAsA4Png(element: HTMLElement, filename: string) {
  // Calculate pixel ratio to hit A4 width
  const ratio = A4_WIDTH_PX / element.offsetWidth;

  const dataUrl = await toPng(element, {
    pixelRatio: ratio,
    backgroundColor: "#ffffff",
    style: {
      // ensure white background
      background: "#ffffff",
    },
    filter: (node) => {
      // hide elements marked as export-hidden
      if (node instanceof HTMLElement && node.dataset.exportHidden === "true") return false;
      return true;
    },
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
