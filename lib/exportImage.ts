import { toPng } from "html-to-image";

// A4 portrait target width at 300dpi
const A4_WIDTH_PX = 2480;

// ─── Black-and-white Excel-style table export ─────────────────────────────────

export interface TableExportCol {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

const CELL = (align: string, bold = false, header = false) =>
  `border:1px solid #000;padding:5px 12px;font-size:13px;text-align:${align};` +
  `white-space:nowrap;color:#000;background:#fff;` +
  (bold ? "font-weight:bold;" : "") +
  (header ? "font-weight:bold;" : "");

export async function exportAsTableImage(opts: {
  title: string;
  subtitle?: string;
  columns: TableExportCol[];
  rows: Record<string, string>[];
  footer?: Record<string, string>;
  summaryLines?: string[];
  filename: string;
}) {
  const { title, subtitle, columns, rows, footer, summaryLines, filename } = opts;

  // Build a fully inline-styled element — no Tailwind classes
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;top:0;left:110vw;background:#fff;padding:16px 20px;" +
    "font-family:Sarabun,\"Noto Sans Thai\",Arial,sans-serif;width:max-content;";

  const addText = (text: string, css: string) => {
    const el = document.createElement("div");
    el.style.cssText = css;
    el.textContent = text;
    wrap.appendChild(el);
  };

  addText(title, "font-size:15px;font-weight:bold;margin-bottom:3px;color:#000;");
  if (subtitle) addText(subtitle, "font-size:13px;color:#333;margin-bottom:10px;");

  const table = document.createElement("table");
  table.style.cssText = "border-collapse:collapse;width:auto;background:#fff;";

  // Header row
  const thead = document.createElement("thead");
  const hrow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.style.cssText = CELL(col.align ?? "center", false, true);
    th.textContent = col.label;
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const col of columns) {
      const td = document.createElement("td");
      td.style.cssText = CELL(col.align ?? "left");
      td.textContent = row[col.key] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Footer row
  if (footer) {
    const tfoot = document.createElement("tfoot");
    const frow = document.createElement("tr");
    for (const col of columns) {
      const td = document.createElement("td");
      td.style.cssText = CELL(col.align ?? "left", true);
      td.textContent = footer[col.key] ?? "";
      frow.appendChild(td);
    }
    tfoot.appendChild(frow);
    table.appendChild(tfoot);
  }

  wrap.appendChild(table);

  // Summary lines below table
  for (const line of summaryLines ?? []) {
    addText(line, "font-size:13px;font-weight:bold;color:#000;margin-top:8px;text-align:right;");
  }

  document.body.appendChild(wrap);
  await new Promise<void>(r => setTimeout(r, 80));

  try {
    const dataUrl = await toPng(wrap, {
      pixelRatio: 2.5,
      backgroundColor: "#ffffff",
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } finally {
    document.body.removeChild(wrap);
  }
}

// ─── Original full-page capture (kept for reference / print use) ─────────────

export async function exportAsA4Png(element: HTMLElement, filename: string, compact = false) {
  const saved: { el: HTMLElement; style: string }[] = [];
  const save = (el: HTMLElement) => saved.push({ el, style: el.style.cssText });

  if (compact) {
    save(element);
    element.style.width = "max-content";
    element.style.minWidth = "0";
    for (const table of element.querySelectorAll("table")) {
      const el = table as HTMLElement;
      save(el);
      el.style.width = "auto";
      el.style.minWidth = "0";
    }
    for (const cell of element.querySelectorAll("th, td")) {
      const el = cell as HTMLElement;
      save(el);
      el.style.padding = "5px 14px";
      el.style.whiteSpace = "nowrap";
    }
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
    for (const { el, style } of saved) el.style.cssText = style;
  }
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
