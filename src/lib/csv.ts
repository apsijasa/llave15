export type CsvCell = string | number | null;

function encodeCell(cell: CsvCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(cell);
  const text = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(encodeCell).join(";")).join("\r\n")}`;
}
