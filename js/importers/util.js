// Funções comuns dos importadores. Rodam no navegador e no Node (testes).
export const digits = (v) => String(v ?? "").replace(/\D/g, "");
export const ieNorm = (v) => digits(v).replace(/^0+/, "");
export const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export function money(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/[^\d,.\-]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const pad = (n) => String(n).padStart(2, "0");

/** Data (serial do Excel, Date, "dd/mm/aaaa" ou "aaaa-mm-dd") -> "aaaa-mm-dd" ou null. */
export function isoDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    v = Math.floor(v);                       // descarta a hora (parte fracionária do serial)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? "");
  let m = s.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^\s*(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export class FormatError extends Error {}

/** Lê uma planilha (.xlsx/.xls/.csv) como lista de linhas. `XLSX` é a biblioteca SheetJS. */
export function sheetNames(XLSX, buf) {
  const wb = XLSX.read(buf, { type: "array", bookSheets: true });
  return wb.SheetNames;
}
export function readRows(XLSX, buf, sheet) {
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  const ws = wb.Sheets[sheet ?? wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
}
export function allSheets(XLSX, buf) {
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  return wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) }));
}
