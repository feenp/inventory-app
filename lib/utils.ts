// Thai Buddhist era year helpers
export function toBEYear(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getFullYear() + 543;
}

export function formatDateTH(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const beYear = d.getFullYear() + 543;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${month}/${beYear}`;
}

export function formatDateMonthTH(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Format number as Thai baht with thousands separator
export function formatBaht(amount: number | null | undefined): string {
  if (amount == null) return "-";
  return amount.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Generate order number: BE year+month + running seq e.g. "6911-0001"
export function makeOrderNumber(yearMonth: string, seq: number): string {
  return `${yearMonth}-${String(seq).padStart(4, "0")}`;
}

// Get Thai BE year+month key from a date, e.g. "6911"
export function getYearMonthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const beYear = d.getFullYear() + 543;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${beYear}${month}`;
}

// Validate lot number: first 8 chars = BE date YYYYMMDD (valid date), rest = pallet digits
export function validateLotNumber(lot: string): { valid: boolean; error?: string } {
  if (lot.length < 9) return { valid: false, error: "เลขล็อตสั้นเกินไป" };
  const datePart = lot.slice(0, 8);
  const palletPart = lot.slice(8);
  if (!/^\d+$/.test(palletPart) || parseInt(palletPart) < 1) {
    return { valid: false, error: "เลขพาเลทต้องเป็นตัวเลขมากกว่า 0" };
  }
  const year = parseInt(datePart.slice(0, 4)) - 543; // convert BE to CE
  const month = parseInt(datePart.slice(4, 6)) - 1;
  const day = parseInt(datePart.slice(6, 8));
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return { valid: false, error: "8 หลักแรกต้องเป็นวันที่ที่มีจริง (พ.ศ.YYYYMMDD)" };
  }
  return { valid: true };
}

// Extract the date from a lot number (returns JS Date in CE)
export function lotNumberToDate(lot: string): Date | null {
  if (lot.length < 8) return null;
  const datePart = lot.slice(0, 8);
  const year = parseInt(datePart.slice(0, 4)) - 543;
  const month = parseInt(datePart.slice(4, 6)) - 1;
  const day = parseInt(datePart.slice(6, 8));
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
