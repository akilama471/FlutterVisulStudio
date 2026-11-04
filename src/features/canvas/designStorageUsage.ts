import { canvasHistoryStorageKey } from "./canvasHistoryStorage";
import { designSetStorageKey, legacyDesignStorageKey } from "./designStorage";
import { snapshotStorageKey } from "./designSnapshots";

export type DesignStorageUsage = {
  designBytes: number;
  legacyBytes: number;
  historyBytes: number;
  snapshotBytes: number;
  totalBytes: number;
};

type ClearDesignStorageOptions = {
  snapshots?: boolean;
};

export function readDesignStorageUsage(projectPath: string): DesignStorageUsage {
  const designBytes = storedBytes(designSetStorageKey(projectPath));
  const legacyBytes = storedBytes(legacyDesignStorageKey(projectPath));
  const historyBytes = storedBytes(canvasHistoryStorageKey(projectPath));
  const snapshotBytes = storedBytes(snapshotStorageKey(projectPath));

  return {
    designBytes,
    legacyBytes,
    historyBytes,
    snapshotBytes,
    totalBytes: designBytes + legacyBytes + historyBytes + snapshotBytes,
  };
}

export function clearProjectDesignStorage(
  projectPath: string,
  options: ClearDesignStorageOptions = {},
): void {
  removeKey(designSetStorageKey(projectPath));
  removeKey(legacyDesignStorageKey(projectPath));
  removeKey(canvasHistoryStorageKey(projectPath));

  if (options.snapshots) {
    removeKey(snapshotStorageKey(projectPath));
  }
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function storedBytes(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);

    return raw === null ? 0 : new TextEncoder().encode(raw).length;
  } catch {
    return 0;
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is unavailable; there is nothing else to clear.
  }
}
