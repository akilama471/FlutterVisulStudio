import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("line diff", () => {
  it("marks identical files as unchanged", () => {
    const diff = diffLines("void main() {}\n", "void main() {}\n");

    expect(diff.lines).toEqual([
      { kind: "same", text: "void main() {}", beforeLine: 1, afterLine: 1 },
    ]);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.truncated).toBe(false);
  });

  it("marks added, removed, and changed lines with line numbers", () => {
    const diff = diffLines("a\nb\nc\n", "a\nB\nc\nd\n");

    expect(diff.lines.map((line) => line.kind)).toEqual([
      "same",
      "removed",
      "added",
      "same",
      "added",
    ]);
    expect(diff.lines[1]).toEqual({ kind: "removed", text: "b", beforeLine: 2, afterLine: null });
    expect(diff.lines[2]).toEqual({ kind: "added", text: "B", beforeLine: null, afterLine: 2 });
    expect(diff.lines[4]).toEqual({ kind: "added", text: "d", beforeLine: null, afterLine: 4 });
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
  });

  it("treats an empty existing file as all additions", () => {
    const diff = diffLines("", "one\ntwo\nthree\n");

    expect(diff.lines.every((line) => line.kind === "added")).toBe(true);
    expect(diff.added).toBe(3);
    expect(diff.removed).toBe(0);
  });

  it("treats an empty generated file as all removals", () => {
    const diff = diffLines("one\ntwo\n", "");

    expect(diff.lines.every((line) => line.kind === "removed")).toBe(true);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(2);
  });

  it("ignores CRLF differences and a trailing newline", () => {
    expect(diffLines("a\r\nb\r\n", "a\nb\n").lines.every((line) => line.kind === "same")).toBe(
      true,
    );
    expect(diffLines("a\nb\n", "a\nb").lines.every((line) => line.kind === "same")).toBe(true);
  });

  it("falls back to a coarse diff for very large files", () => {
    const before = Array.from({ length: 2001 }, (_, index) => `before ${index}`).join("\n");
    const after = Array.from({ length: 2001 }, (_, index) => `after ${index}`).join("\n");
    const diff = diffLines(before, after);

    expect(diff.truncated).toBe(true);
    expect(diff.added).toBe(2001);
    expect(diff.removed).toBe(2001);
    expect(diff.lines).toHaveLength(4002);
  });
});
