import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectInfo } from "../../shared/lib/project";
import {
  createCanvasHistoryEntry,
  loadCanvasHistories,
  rootFingerprint,
  saveCanvasHistories,
  trimCanvasHistory,
  type CanvasHistoryMap,
} from "./canvasHistoryStorage";
import {
  addCanvas,
  createCanvasSet,
  duplicateCanvas as duplicateCanvasInSet,
  MAX_CANVASES,
  removeCanvas,
  renameCanvas as renameCanvasInSet,
  reorderCanvas as reorderCanvasInSet,
  replaceCanvasRoot,
  restoreCanvas,
  selectCanvas,
  type DesignCanvas,
  type DesignSet,
  type RemovedCanvas,
} from "./designSet";
import { addImportedCanvas as addImportedCanvasToSet, reidentifyDesignSet } from "./designTransfer";
import {
  clearLegacyDesign,
  designSetBytes,
  loadDesignSet,
  MAX_DESIGN_BYTES_WARNING,
  saveDesignSet,
  type DesignSaveStatus,
} from "./designStorage";
import {
  loadDesignSnapshots,
  recordDesignSnapshot,
  type DesignSnapshot,
  type SnapshotReason,
} from "./designSnapshots";
import {
  clearProjectDesignStorage,
  readDesignStorageUsage,
  type DesignStorageUsage,
} from "./designStorageUsage";
import { DesignWorkspaceContext, type DesignWorkspace } from "./designWorkspaceContext";
import {
  adoptWidgetIds,
  findNode,
  topLevelSelection,
  type CanvasHistory,
  type CanvasNode,
} from "./model";

const AUTOSAVE_DELAY = 250;
const HISTORY_SAVE_DELAY = 300;

type WorkspaceState = {
  set: DesignSet;
  dirty: boolean;
  status: DesignSaveStatus;
  legacy: boolean;
  deleted: RemovedCanvas[];
  bytes: number;
};

type DesignWorkspaceProviderProps = {
  project: ProjectInfo;
  children: ReactNode;
};

export function DesignWorkspaceProvider({ project, children }: DesignWorkspaceProviderProps) {
  const [initial] = useState(() => loadDesignSet(project.path));
  const [initialHistory] = useState<CanvasHistoryMap>(() => {
    const histories = loadCanvasHistories(project.path, initial.set.canvases);

    for (const entry of histories.values()) {
      for (const snapshot of [...entry.past, ...entry.future]) {
        adoptWidgetIds(snapshot.root);
      }
    }

    return histories;
  });
  const [state, setState] = useState<WorkspaceState>(() => ({
    set: initial.set,
    dirty: initial.status !== "restored",
    status: initial.status === "restored" ? "saved" : "saving",
    legacy: initial.status === "migrated",
    deleted: [],
    bytes: designSetBytes(initial.set),
  }));
  const [clipboard, setClipboard] = useState<CanvasNode[]>([]);
  const [revision, setRevision] = useState(0);
  const [snapshots, setSnapshots] = useState<DesignSnapshot[]>(() =>
    loadDesignSnapshots(project.path),
  );
  const [storageUsage, setStorageUsage] = useState<DesignStorageUsage>(() =>
    readDesignStorageUsage(project.path),
  );
  const stateRef = useRef(state);
  const historyRef = useRef(initialHistory);
  const snapshotsRef = useRef(snapshots);
  const historyTimer = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  const refreshStorageUsage = useCallback(() => {
    setStorageUsage(readDesignStorageUsage(project.path));
  }, [project.path]);

  const captureSnapshot = useCallback(
    (reason: SnapshotReason): boolean => {
      const next = recordDesignSnapshot(
        project.path,
        snapshotsRef.current,
        stateRef.current.set,
        reason,
        Date.now(),
      );

      if (!next) {
        return false;
      }

      snapshotsRef.current = next;
      setSnapshots(next);
      refreshStorageUsage();
      return true;
    },
    [project.path, refreshStorageUsage],
  );

  const flushHistory = useCallback(() => {
    if (historyTimer.current !== null) {
      window.clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }

    saveCanvasHistories(project.path, historyRef.current);
  }, [project.path]);

  const scheduleHistorySave = useCallback(() => {
    if (historyTimer.current !== null) {
      window.clearTimeout(historyTimer.current);
    }

    historyTimer.current = window.setTimeout(() => {
      historyTimer.current = null;
      saveCanvasHistories(project.path, historyRef.current);
    }, HISTORY_SAVE_DELAY);
  }, [project.path]);

  useEffect(() => {
    if (!state.dirty) {
      return;
    }

    const timer = window.setTimeout(() => {
      const set = stateRef.current.set;

      if (saveDesignSet(project.path, set)) {
        if (stateRef.current.legacy) {
          clearLegacyDesign(project.path);
        }
        captureSnapshot("auto");
        refreshStorageUsage();
        setState((current) => ({
          ...current,
          dirty: false,
          status: "saved",
          legacy: false,
          bytes: designSetBytes(set),
        }));
      } else {
        setState((current) => ({ ...current, status: "error" }));
      }
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [captureSnapshot, project.path, refreshStorageUsage, state.dirty, state.set]);

  useEffect(() => {
    function flush() {
      flushHistory();

      const current = stateRef.current;

      if (!current.dirty) {
        return;
      }

      const set = current.set;

      if (saveDesignSet(project.path, set)) {
        if (current.legacy) {
          clearLegacyDesign(project.path);
        }
        stateRef.current = {
          ...current,
          dirty: false,
          status: "saved",
          legacy: false,
          bytes: designSetBytes(set),
        };
      }
    }

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);

    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flushHistory, project.path]);

  useEffect(() => {
    const ids = new Set(state.set.canvases.map((canvas) => canvas.id));
    let changed = false;

    for (const id of [...historyRef.current.keys()]) {
      if (!ids.has(id)) {
        historyRef.current.delete(id);
        changed = true;
      }
    }

    if (changed) {
      scheduleHistorySave();
    }
  }, [scheduleHistorySave, state.set.canvases]);

  const createCanvas = useCallback(() => {
    setState((current) => {
      const set = addCanvas(current.set);

      if (set === current.set) {
        return current;
      }

      return { ...current, set, dirty: true, status: "saving" };
    });
  }, []);

  const duplicateCanvas = useCallback((id: string) => {
    setState((current) => {
      const set = duplicateCanvasInSet(current.set, id);

      if (set === current.set) {
        return current;
      }

      return { ...current, set, dirty: true, status: "saving" };
    });
  }, []);

  const reorderCanvas = useCallback(
    (id: string, targetId: string, position: "before" | "after") => {
      setState((current) => {
        const set = reorderCanvasInSet(current.set, id, targetId, position);

        if (set === current.set) {
          return current;
        }

        return { ...current, set, dirty: true, status: "saving" };
      });
    },
    [],
  );

  const selectCanvasInSet = useCallback((id: string) => {
    setState((current) => {
      const set = selectCanvas(current.set, id);

      return set === current.set ? current : { ...current, set };
    });
  }, []);

  const renameCanvas = useCallback((id: string, name: string) => {
    setState((current) => {
      const set = renameCanvasInSet(current.set, id, name);

      if (set === current.set) {
        return current;
      }

      return { ...current, set, dirty: true, status: "saving" };
    });
  }, []);

  const deleteCanvas = useCallback((id: string) => {
    setState((current) => {
      const result = removeCanvas(current.set, id);

      if (!result.removed) {
        return current;
      }

      return {
        ...current,
        set: result.set,
        dirty: true,
        status: "saving",
        deleted: [result.removed, ...current.deleted],
      };
    });
  }, []);

  const undoDelete = useCallback((id: string) => {
    setState((current) => {
      const pending = current.deleted.find((entry) => entry.canvas.id === id);

      if (!pending) {
        return current;
      }

      const set = restoreCanvas(current.set, pending);

      if (set === current.set) {
        return current;
      }

      return {
        ...current,
        set,
        dirty: true,
        status: "saving",
        deleted: current.deleted.filter((entry) => entry.canvas.id !== id),
      };
    });
  }, []);

  const dismissDelete = useCallback((id: string) => {
    setState((current) => {
      const deleted = current.deleted.filter((entry) => entry.canvas.id !== id);

      return deleted.length === current.deleted.length ? current : { ...current, deleted };
    });
  }, []);

  const updateCanvasRoot = useCallback((id: string, root: CanvasNode) => {
    setState((current) => {
      const set = replaceCanvasRoot(current.set, id, root);

      if (set === current.set) {
        return current;
      }

      return { ...current, set, dirty: true, status: "saving" };
    });
  }, []);

  const copySelection = useCallback((canvasId: string, ids: readonly string[]) => {
    const canvas = stateRef.current.set.canvases.find((entry) => entry.id === canvasId);

    if (!canvas) {
      return;
    }

    const topLevel = topLevelSelection(canvas.root, ids).filter((id) => id !== canvas.root.id);
    const nodes = topLevel
      .map((id) => findNode(canvas.root, id))
      .filter((node): node is CanvasNode => node !== null);

    if (nodes.length > 0) {
      setClipboard(nodes);
    }
  }, []);

  const loadCanvasHistory = useCallback(
    (canvasId: string, root: CanvasNode): CanvasHistory | null => {
      const entry = historyRef.current.get(canvasId);

      if (!entry || entry.rootFingerprint !== rootFingerprint(root)) {
        return null;
      }

      return { past: entry.past, future: entry.future };
    },
    [],
  );

  const saveCanvasHistory = useCallback(
    (canvasId: string, root: CanvasNode, history: CanvasHistory) => {
      const entry = createCanvasHistoryEntry(root, history);

      if (entry) {
        historyRef.current.set(canvasId, trimCanvasHistory(entry));
      } else {
        historyRef.current.delete(canvasId);
      }

      scheduleHistorySave();
    },
    [scheduleHistorySave],
  );

  const replaceDesign = useCallback(
    (set: DesignSet) => {
      const prepared = reidentifyDesignSet(set);

      historyRef.current.clear();
      saveCanvasHistories(project.path, historyRef.current);

      setState((current) => ({
        ...current,
        set: prepared,
        dirty: true,
        status: "saving",
        legacy: false,
        deleted: [],
        bytes: designSetBytes(prepared),
      }));
      setRevision((current) => current + 1);
      refreshStorageUsage();
    },
    [project.path, refreshStorageUsage],
  );

  const applyImportedDesign = useCallback(
    (set: DesignSet): boolean => {
      if (set.canvases.length === 0) {
        return false;
      }

      captureSnapshot("before-import");
      replaceDesign(set);
      return true;
    },
    [captureSnapshot, replaceDesign],
  );

  const addImportedCanvas = useCallback(
    (canvas: DesignCanvas): boolean => {
      const nextSet = addImportedCanvasToSet(stateRef.current.set, canvas);

      if (!nextSet) {
        return false;
      }

      captureSnapshot("before-import");
      setState((current) => ({
        ...current,
        set: nextSet,
        dirty: true,
        status: "saving",
        legacy: false,
        deleted: [],
        bytes: designSetBytes(nextSet),
      }));
      setRevision((current) => current + 1);
      refreshStorageUsage();
      return true;
    },
    [captureSnapshot, refreshStorageUsage],
  );

  const restoreSnapshot = useCallback(
    (id: string): boolean => {
      const snapshot = snapshotsRef.current.find((entry) => entry.id === id);

      if (!snapshot) {
        return false;
      }

      captureSnapshot("before-restore");
      replaceDesign(snapshot.set);
      return true;
    },
    [captureSnapshot, replaceDesign],
  );

  const resetProjectDesign = useCallback((): boolean => {
    captureSnapshot("before-reset");
    clearProjectDesignStorage(project.path);
    historyRef.current.clear();

    const fresh = createCanvasSet();

    setState((current) => ({
      ...current,
      set: fresh,
      dirty: true,
      status: "saving",
      legacy: false,
      deleted: [],
      bytes: designSetBytes(fresh),
    }));
    setRevision((current) => current + 1);
    refreshStorageUsage();
    return true;
  }, [captureSnapshot, project.path, refreshStorageUsage]);

  const activeCanvas =
    state.set.canvases.find((canvas) => canvas.id === state.set.activeId) ?? state.set.canvases[0];

  const value = useMemo<DesignWorkspace>(
    () => ({
      canvases: state.set.canvases,
      activeCanvas,
      activeId: state.set.activeId,
      projectName: project.name,
      revision,
      saveStatus: state.status,
      canDeleteCanvas: state.set.canvases.length > 1,
      atCanvasLimit: state.set.canvases.length >= MAX_CANVASES,
      deletedCanvases: state.deleted,
      storageBytes: state.bytes,
      storageWarning: state.bytes >= MAX_DESIGN_BYTES_WARNING,
      storageUsage,
      snapshots,
      clipboard,
      createCanvas,
      duplicateCanvas,
      reorderCanvas,
      selectCanvas: selectCanvasInSet,
      renameCanvas,
      deleteCanvas,
      undoDelete,
      dismissDelete,
      updateCanvasRoot,
      copySelection,
      loadCanvasHistory,
      saveCanvasHistory,
      captureSnapshot,
      applyImportedDesign,
      addImportedCanvas,
      restoreSnapshot,
      resetProjectDesign,
      refreshStorageUsage,
    }),
    [
      activeCanvas,
      addImportedCanvas,
      applyImportedDesign,
      captureSnapshot,
      clipboard,
      copySelection,
      createCanvas,
      deleteCanvas,
      dismissDelete,
      duplicateCanvas,
      loadCanvasHistory,
      project.name,
      refreshStorageUsage,
      renameCanvas,
      reorderCanvas,
      resetProjectDesign,
      restoreSnapshot,
      revision,
      saveCanvasHistory,
      selectCanvasInSet,
      snapshots,
      state.deleted,
      state.set,
      state.status,
      state.bytes,
      storageUsage,
      undoDelete,
      updateCanvasRoot,
    ],
  );

  return (
    <DesignWorkspaceContext.Provider value={value}>{children}</DesignWorkspaceContext.Provider>
  );
}
