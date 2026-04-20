// Normalize varied date inputs (Excel serials, Israeli D/M/Y, US M/D/Y, ISO,
// JS Date) into canonical YYYY-MM-DD so they sort lexically.
export function normalizeDate(raw: any): string | null {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  // Excel serial (days since 1899-12-30)
  if (typeof raw === "number" && isFinite(raw) && raw > 0 && raw < 80000) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Already canonical YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Slash/dash/dot separated. Disambiguate D/M/Y vs M/D/Y by the obvious cases:
  // if first > 12, it must be D/M/Y; if second > 12, it must be M/D/Y.
  // Otherwise default to D/M/Y (Israeli context).
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let y = m[3];
    if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;

    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      // Ambiguous — default to D/M/Y (Israeli)
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}
