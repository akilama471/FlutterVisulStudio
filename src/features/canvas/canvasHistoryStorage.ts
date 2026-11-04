import { parseDesignNode } from "./designStorage";
import {
  normalizeSelection,
  type CanvasHistory,
  type CanvasNode,
  type CanvasSnapshot,
} from "./model";

const STORAGE_PREFIX = "flutter-ui-studio:history:v1:";
const HISTORY_VERSION = 1;
const MAX_SELECTION_IDS = 1000;

export const MAX_PERSISTED_PAST = 40;
export const MAX_PERSISTED_FUTURE = 20;
export const MAX_HISTORY_BYTES = 512 * 1024;

export type PersistedCanvasHistory = {
  rootFingerprint: string;
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
};

export type CanvasHistoryMap = Map<string, PersistedCanvasHistory>;

type HistoryCanvas = {
  id: string;
  root: CanvasNode;
};

export function canvasHistoryStorageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(projectPath)}`;
}

export function rootFingerprint(root: CanvasNode): string {
  const text = JSON.stringify(root);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${root.id}:${(hash >>> 0).toString(16)}`;
}

export function createCanvasHistoryEntry(
  root: CanvasNode,
  history: CanvasHistory,
): PersistedCanvasHistory | null {
  if (history.past.length === 0 && history.future.length === 0) {
    return null;
  }

  return {
    rootFingerprint: rootFingerprint(root),
    past: history.past.slice(-MAX_PERSISTED_PAST),
    future: history.future.slice(0, MAX_PERSISTED_FUTURE),
  };
}

export function parseCanvasHistories(
  raw: string,
  canvases: readonly HistoryCanvas[],
): CanvasHistoryMap {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return new Map();
  }

  if (!isRecord(payload) || payload.version !== HISTORY_VERSION || !isRecord(payload.entries)) {
    return new Map();
  }

  const result: CanvasHistoryMap = new Map();

  for (const canvas of canvases) {
    const value = payload.entries[canvas.id];

    if (!isRecord(value) || typeof value.rootFingerprint !== "string") {
      continue;
    }

    if (value.rootFingerprint !== rootFingerprint(canvas.root)) {
      continue;
    }

    const past = parseSnapshots(value.past, MAX_PERSISTED_PAST);
    const future = parseSnapshots(value.future, MAX_PERSISTED_FUTURE);

    if (!past || !future) {
      continue;
    }

    if (past.length === 0 && future.length === 0) {
      continue;
    }

    result.set(canvas.id, {
      rootFingerprint: value.rootFingerprint,
      past,
      future,
    });
  }

  return result;
}

export function loadCanvasHistories(
  projectPath: string,
  canvases: readonly HistoryCanvas[],
): CanvasHistoryMap {
  let raw: string | null;

  try {
    raw = window.localStorage.getItem(canvasHistoryStorageKey(projectPath));
  } catch {
    return new Map();
  }

  return raw === null ? new Map() : parseCanvasHistories(raw, canvases);
}

export function serializeCanvasHistories(entries: CanvasHistoryMap): string | null {
  if (entries.size === 0) {
    return null;
  }

  const copy: CanvasHistoryMap = new Map();

  for (const [id, entry] of entries) {
    copy.set(id, {
      rootFingerprint: entry.rootFingerprint,
      past: entry.past.slice(-MAX_PERSISTED_PAST),
      future: entry.future.slice(0, MAX_PERSISTED_FUTURE),
    });
  }

  let raw = serializeEntries(copy);

  while (byteLength(raw) > MAX_HISTORY_BYTES) {
    let changed = false;

    for (const entry of copy.values()) {
      if (entry.past.length > 0) {
        const drop = Math.max(1, Math.ceil(entry.past.length / 4));
        entry.past = entry.past.slice(drop);
        changed = true;
      }
    }

    if (!changed) {
      for (const entry of copy.values()) {
        if (entry.future.length > 0) {
          const drop = Math.max(1, Math.ceil(entry.future.length / 4));
          entry.future = entry.future.slice(0, entry.future.length - drop);
          changed = true;
        }
      }
    }

    if (!changed) {
      const last = [...copy.keys()].pop();
      if (last) {
        copy.delete(last);
        changed = true;
      }
    }

    if (!changed) {
      return null;
    }

    if (copy.size === 0) {
      return null;
    }

    raw = serializeEntries(copy);
  }

  return raw;
}

export function saveCanvasHistories(projectPath: string, entries: CanvasHistoryMap): boolean {
  try {
    const raw = serializeCanvasHistories(entries);

    if (raw === null) {
      window.localStorage.removeItem(canvasHistoryStorageKey(projectPath));
      return true;
    }

    window.localStorage.setItem(canvasHistoryStorageKey(projectPath), raw);
    return true;
  } catch {
    return false;
  }
}

export function trimCanvasHistory(entry: PersistedCanvasHistory): PersistedCanvasHistory {
  return {
    rootFingerprint: entry.rootFingerprint,
    past: entry.past.slice(-MAX_PERSISTED_PAST),
    future: entry.future.slice(0, MAX_PERSISTED_FUTURE),
  };
}

function parseSnapshots(value: unknown, limit: number): CanvasSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const snapshots: CanvasSnapshot[] = [];

  for (const item of value.slice(-limit)) {
    if (!isRecord(item)) {
      return null;
    }

    const root = parseDesignNode(item.root);

    if (!root || root.kind !== "screen") {
      return null;
    }

    if (
      !Array.isArray(item.selectedIds) ||
      item.selectedIds.length > MAX_SELECTION_IDS ||
      (item.anchorId !== null && typeof item.anchorId !== "string")
    ) {
      return null;
    }

    const ids = item.selectedIds.filter((id): id is string => typeof id === "string");
    if (ids.length !== item.selectedIds.length) {
      return null;
    }

    const selection = normalizeSelection(
      root,
      ids,
      typeof item.anchorId === "string" ? item.anchorId : null,
    );

    snapshots.push({
      root,
      selectedIds: selection.selectedIds,
      anchorId: selection.anchorId,
    });
  }

  return snapshots;
}

function serializeEntries(entries: CanvasHistoryMap): string {
  return JSON.stringify({
    version: HISTORY_VERSION,
    entries: Object.fromEntries(entries),
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
