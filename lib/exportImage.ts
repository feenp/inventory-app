import { toPng } from "html-to-image";

// A4 portrait target width at 300dpi
const A4_WIDTH_PX = 2480;

// ─── Black-and-white Excel-style table export ─────────────────────────────────

export interface TableExportCol {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

export interface TableExportSection {
  label?: string;
  columns: TableExportCol[];
  rows: Record<string, string>[];
  footer?: Record<string, string>;
}

const CELL = (align: string, bold = false, header = false) =>
  `border:1px solid #000;padding:5px 12px;font-size:13px;text-align:${align};` +
  `white-space:nowrap;color:#000;background:#fff;` +
  (bold ? "font-weight:bold;" : "") +
  (header ? "font-weight:bold;" : "");

function buildTableEl(columns: TableExportCol[], rows: Record<string, string>[], footer?: Record<string, string>): HTMLTableElement {
  const table = document.createElement("table");
  table.style.cssText = "border-collapse:collapse;width:auto;background:#fff;";

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

  return table;
}

export async function exportAsTableImage(opts: {
  title: string;
  subtitle?: string;
  // Single-section shorthand (backward compat)
  columns?: TableExportCol[];
  rows?: Record<string, string>[];
  footer?: Record<string, string>;
  // Multi-section
  sections?: TableExportSection[];
  summaryLines?: string[];
  filename: string;
}) {
  const { title, subtitle, summaryLines, filename } = opts;

  // Normalise to sections array
  const sections: TableExportSection[] = opts.sections ?? (opts.columns ? [{
    columns: opts.columns,
    rows: opts.rows ?? [],
    footer: opts.footer,
  }] : []);

  // Outer shell keeps the element off-screen in the real DOM so the browser paints it.
  // We capture the inner `wrap` which has no fixed positioning, preventing html-to-image
  // from placing content outside the canvas bounds.
  const shell = document.createElement("div");
  shell.style.cssText = "position:fixed;top:0;left:110vw;pointer-events:none;";

  const wrap = document.createElement("div");
  wrap.style.cssText =
    "display:inline-block;background:#fff;padding:16px 20px;" +
    "font-family:Arial,sans-serif;width:max-content;";

  shell.appendChild(wrap);

  const addText = (text: string, css: string) => {
    const el = document.createElement("div");
    el.style.cssText = css;
    el.textContent = text;
    wrap.appendChild(el);
  };

  addText(title, "font-size:15px;font-weight:bold;margin-bottom:3px;color:#000;");
  if (subtitle) addText(subtitle, "font-size:13px;color:#333;margin-bottom:10px;");

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (i > 0) {
      // Divider between sections
      const sep = document.createElement("div");
      sep.style.cssText =
        "border-top:1px solid #ccc;margin-top:16px;padding-top:12px;" +
        (section.label
          ? "font-size:13px;font-weight:bold;color:#000;margin-bottom:6px;"
          : "");
      if (section.label) sep.textContent = section.label;
      wrap.appendChild(sep);
    }
    wrap.appendChild(buildTableEl(section.columns, section.rows, section.footer));
  }

  for (const line of summaryLines ?? []) {
    addText(line, "font-size:13px;font-weight:bold;color:#000;margin-top:8px;text-align:right;");
  }

  document.body.appendChild(shell);
  await new Promise<void>(r => setTimeout(r, 200));

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
    document.body.removeChild(shell);
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
