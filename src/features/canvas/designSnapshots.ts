import type { DesignSet } from "./designSet";
import { parseDesignSet, serializeDesignSet } from "./designStorage";

const STORAGE_PREFIX = "flutter-ui-studio:snapshots:v1:";
const SNAPSHOT_VERSION = 1;

export const MAX_SNAPSHOTS = 8;
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
export const MAX_SNAPSHOT_TOTAL_BYTES = 1024 * 1024;
export const SNAPSHOT_MIN_INTERVAL_MS = 60_000;

export type SnapshotReason = "auto" | "before-import" | "before-restore" | "before-reset";

export type DesignSnapshot = {
  id: string;
  createdAt: number;
  reason: SnapshotReason;
  bytes: number;
  set: DesignSet;
};

export type DesignSnapshotSummary = {
  id: string;
  createdAt: number;
  reason: SnapshotReason;
  bytes: number;
  canvasCount: number;
};

const REASONS: readonly SnapshotReason[] = [
  "auto",
  "before-import",
  "before-restore",
  "before-reset",
];

export function snapshotStorageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(projectPath)}`;
}

export function createDesignSnapshot(
  set: DesignSet,
  reason: SnapshotReason,
  now: number,
  existingIds: Iterable<string> = [],
): DesignSnapshot | null {
  const serialized = serializeDesignSet(set);
  const bytes = byteLength(serialized);

  if (bytes > MAX_SNAPSHOT_BYTES) {
    return null;
  }

  const snapshot = parseDesignSet(serialized);

  if (!snapshot) {
    return null;
  }

  const usedIds = new Set(existingIds);
  let id = `snap-${now}`;
  let suffix = 1;

  while (usedIds.has(id)) {
    id = `snap-${now}-${suffix}`;
    suffix += 1;
  }

  return { id, createdAt: now, reason, bytes, set: snapshot };
}

export function addDesignSnapshot(
  snapshots: readonly DesignSnapshot[],
  snapshot: DesignSnapshot,
): DesignSnapshot[] {
  const next = [snapshot, ...snapshots.filter((entry) => entry.id !== snapshot.id)].slice(
    0,
    MAX_SNAPSHOTS,
  );
  let total = next.reduce((sum, entry) => sum + entry.bytes, 0);

  while (total > MAX_SNAPSHOT_TOTAL_BYTES && next.length > 1) {
    const removed = next.pop();
    total -= removed?.bytes ?? 0;
  }

  return next;
}

export function shouldCaptureAutoSnapshot(
  snapshots: readonly DesignSnapshot[],
  set: DesignSet,
  now: number,
  minimumInterval = SNAPSHOT_MIN_INTERVAL_MS,
): boolean {
  const latest = snapshots[0];

  if (!latest) {
    return true;
  }

  if (now - latest.createdAt < minimumInterval) {
    return false;
  }

  return serializeDesignSet(latest.set) !== serializeDesignSet(set);
}

export function recordDesignSnapshot(
  projectPath: string,
  snapshots: readonly DesignSnapshot[],
  set: DesignSet,
  reason: SnapshotReason,
  now: number,
): DesignSnapshot[] | null {
  if (reason === "auto" && !shouldCaptureAutoSnapshot(snapshots, set, now)) {
    return null;
  }

  const snapshot = createDesignSnapshot(
    set,
    reason,
    now,
    snapshots.map((entry) => entry.id),
  );

  if (!snapshot) {
    return null;
  }

  const next = addDesignSnapshot(snapshots, snapshot);

  return saveDesignSnapshots(projectPath, next) ? next : null;
}

export function summarizeSnapshots(snapshots: readonly DesignSnapshot[]): DesignSnapshotSummary[] {
  return snapshots.map(({ id, createdAt, reason, bytes, set }) => ({
    id,
    createdAt,
    reason,
    bytes,
    canvasCount: set.canvases.length,
  }));
}

export function loadDesignSnapshots(projectPath: string): DesignSnapshot[] {
  let raw: string | null;

  try {
    raw = window.localStorage.getItem(snapshotStorageKey(projectPath));
  } catch {
    return [];
  }

  return raw === null ? [] : parseDesignSnapshots(raw);
}

export function parseDesignSnapshots(raw: string): DesignSnapshot[] {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }

  if (
    !isRecord(payload) ||
    payload.version !== SNAPSHOT_VERSION ||
    !Array.isArray(payload.entries)
  ) {
    return [];
  }

  const snapshots: DesignSnapshot[] = [];
  const ids = new Set<string>();

  for (const value of payload.entries) {
    if (!isRecord(value)) {
      continue;
    }

    if (
      typeof value.id !== "string" ||
      value.id.length === 0 ||
      value.id.length > 80 ||
      ids.has(value.id) ||
      typeof value.createdAt !== "number" ||
      !Number.isInteger(value.createdAt) ||
      value.createdAt < 0 ||
      !isSnapshotReason(value.reason)
    ) {
      continue;
    }

    const set = parseDesignSet(JSON.stringify(value.design));

    if (!set) {
      continue;
    }

    const serialized = serializeDesignSet(set);
    const bytes = byteLength(serialized);

    if (bytes > MAX_SNAPSHOT_BYTES) {
      continue;
    }

    ids.add(value.id);
    snapshots.push({
      id: value.id,
      createdAt: value.createdAt,
      reason: value.reason,
      bytes,
      set,
    });
  }

  snapshots.sort((left, right) => right.createdAt - left.createdAt);

  let total = 0;
  const limited: DesignSnapshot[] = [];

  for (const snapshot of snapshots) {
    if (limited.length >= MAX_SNAPSHOTS || total + snapshot.bytes > MAX_SNAPSHOT_TOTAL_BYTES) {
      continue;
    }

    limited.push(snapshot);
    total += snapshot.bytes;
  }

  return limited;
}

export function saveDesignSnapshots(
  projectPath: string,
  snapshots: readonly DesignSnapshot[],
): boolean {
  try {
    if (snapshots.length === 0) {
      window.localStorage.removeItem(snapshotStorageKey(projectPath));
      return true;
    }

    window.localStorage.setItem(
      snapshotStorageKey(projectPath),
      JSON.stringify({
        version: SNAPSHOT_VERSION,
        entries: snapshots.map(({ id, createdAt, reason, bytes, set }) => ({
          id,
          createdAt,
          reason,
          bytes,
          design: JSON.parse(serializeDesignSet(set)) as unknown,
        })),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearDesignSnapshots(projectPath: string): void {
  try {
    window.localStorage.removeItem(snapshotStorageKey(projectPath));
  } catch {
    // Storage is unavailable; there is nothing else to clear.
  }
}

function isSnapshotReason(value: unknown): value is SnapshotReason {
  return typeof value === "string" && REASONS.includes(value as SnapshotReason);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
