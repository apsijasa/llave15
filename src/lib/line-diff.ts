export type DiffLine = { kind: "same" | "add" | "del"; text: string };

export const LINE_DIFF_LIMIT = 400;

function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i] as number[];
    const next = table[i + 1] as number[];
    for (let j = b.length - 1; j >= 0; j -= 1)
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
  }
  return table;
}

function linesOf(text: string): string[] {
  return text === "" ? [] : text.replace(/\r\n/g, "\n").split("\n");
}

/** Diferencia por líneas (LCS). `null` si algún lado supera el límite. */
export function lineDiff(
  before: string,
  after: string,
  limit = LINE_DIFF_LIMIT,
): DiffLine[] | null {
  const a = linesOf(before);
  const b = linesOf(after);
  if (a.length > limit || b.length > limit) return null;
  const table = lcsTable(a, b);
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ kind: "same", text: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i >= a.length || (table[i]?.[j + 1] ?? 0) >= (table[i + 1]?.[j] ?? 0))
    ) {
      result.push({ kind: "add", text: b[j] ?? "" });
      j += 1;
    } else {
      result.push({ kind: "del", text: a[i] ?? "" });
      i += 1;
    }
  }
  return result;
}
