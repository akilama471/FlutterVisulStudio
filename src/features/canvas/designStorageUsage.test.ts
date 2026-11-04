import { beforeEach, describe, expect, it } from "vitest";
import { canvasHistoryStorageKey } from "./canvasHistoryStorage";
import {
  clearProjectDesignStorage,
  formatStorageBytes,
  readDesignStorageUsage,
} from "./designStorageUsage";
import { designSetStorageKey, legacyDesignStorageKey } from "./designStorage";
import { snapshotStorageKey } from "./designSnapshots";

const PROJECT = "C:\\Projects\\demo_app";

function bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

describe("design storage usage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports zero when nothing is stored", () => {
    expect(readDesignStorageUsage(PROJECT)).toEqual({
      designBytes: 0,
      legacyBytes: 0,
      historyBytes: 0,
      snapshotBytes: 0,
      totalBytes: 0,
    });
  });

  it("measures every design-related key in UTF-8 bytes", () => {
    window.localStorage.setItem(designSetStorageKey(PROJECT), '{"design":"é"}');
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), "legacy");
    window.localStorage.setItem(canvasHistoryStorageKey(PROJECT), "history");
    window.localStorage.setItem(snapshotStorageKey(PROJECT), "snapshots");

    expect(readDesignStorageUsage(PROJECT)).toEqual({
      designBytes: bytes('{"design":"é"}'),
      legacyBytes: bytes("legacy"),
      historyBytes: bytes("history"),
      snapshotBytes: bytes("snapshots"),
      totalBytes: bytes('{"design":"é"}') + bytes("legacy") + bytes("history") + bytes("snapshots"),
    });
  });

  it("clears design data but keeps snapshots by default", () => {
    window.localStorage.setItem(designSetStorageKey(PROJECT), "design");
    window.localStorage.setItem(legacyDesignStorageKey(PROJECT), "legacy");
    window.localStorage.setItem(canvasHistoryStorageKey(PROJECT), "history");
    window.localStorage.setItem(snapshotStorageKey(PROJECT), "snapshots");

    clearProjectDesignStorage(PROJECT);

    expect(window.localStorage.getItem(designSetStorageKey(PROJECT))).toBeNull();
    expect(window.localStorage.getItem(legacyDesignStorageKey(PROJECT))).toBeNull();
    expect(window.localStorage.getItem(canvasHistoryStorageKey(PROJECT))).toBeNull();
    expect(window.localStorage.getItem(snapshotStorageKey(PROJECT))).toBe("snapshots");
  });

  it("can clear snapshots as well", () => {
    window.localStorage.setItem(snapshotStorageKey(PROJECT), "snapshots");

    clearProjectDesignStorage(PROJECT, { snapshots: true });

    expect(window.localStorage.getItem(snapshotStorageKey(PROJECT))).toBeNull();
  });

  it("formats storage sizes for the dialog", () => {
    expect(formatStorageBytes(0)).toBe("0 B");
    expect(formatStorageBytes(1023)).toBe("1023 B");
    expect(formatStorageBytes(1024)).toBe("1.0 KiB");
    expect(formatStorageBytes(1024 * 1024)).toBe("1.0 MiB");
  });
});
