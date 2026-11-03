export type DiffLineKind = "same" | "added" | "removed";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  beforeLine: number | null;
  afterLine: number | null;
};

export type LineDiff = {
  lines: DiffLine[];
  added: number;
  removed: number;
  truncated: boolean;
};

const MAX_DIFF_LINES = 2000;

export function diffLines(beforeText: string, afterText: string): LineDiff {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);

  if (before.length > MAX_DIFF_LINES || after.length > MAX_DIFF_LINES) {
    return coarseDiff(before, after);
  }

  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({ kind: "same", text: before[i], beforeLine: i + 1, afterLine: j + 1 });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      lines.push({ kind: "removed", text: before[i], beforeLine: i + 1, afterLine: null });
      i += 1;
    } else {
      lines.push({ kind: "added", text: after[j], beforeLine: null, afterLine: j + 1 });
      j += 1;
    }
  }

  while (i < before.length) {
    lines.push({ kind: "removed", text: before[i], beforeLine: i + 1, afterLine: null });
    i += 1;
  }

  while (j < after.length) {
    lines.push({ kind: "added", text: after[j], beforeLine: null, afterLine: j + 1 });
    j += 1;
  }

  return {
    lines,
    added: lines.filter((line) => line.kind === "added").length,
    removed: lines.filter((line) => line.kind === "removed").length,
    truncated: false,
  };
}

function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function coarseDiff(before: string[], after: string[]): LineDiff {
  const lines: DiffLine[] = [
    ...before.map<DiffLine>((text, index) => ({
      kind: "removed",
      text,
      beforeLine: index + 1,
      afterLine: null,
    })),
    ...after.map<DiffLine>((text, index) => ({
      kind: "added",
      text,
      beforeLine: null,
      afterLine: index + 1,
    })),
  ];

  return { lines, added: after.length, removed: before.length, truncated: true };
}
