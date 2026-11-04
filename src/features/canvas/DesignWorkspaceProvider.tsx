import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectInfo } from "../../shared/lib/project";
import {
  addCanvas,
  MAX_CANVASES,
  removeCanvas,
  renameCanvas as renameCanvasInSet,
  replaceCanvasRoot,
  restoreCanvas,
  selectCanvas,
  type DesignSet,
  type RemovedCanvas,
} from "./designSet";
import {
  clearLegacyDesign,
  loadDesignSet,
  saveDesignSet,
  type DesignSaveStatus,
} from "./designStorage";
import { DesignWorkspaceContext, type DesignWorkspace } from "./designWorkspaceContext";
import type { CanvasNode } from "./model";

const AUTOSAVE_DELAY = 250;

type WorkspaceState = {
  set: DesignSet;
  dirty: boolean;
  status: DesignSaveStatus;
  legacy: boolean;
  deleted: RemovedCanvas[];
};

type DesignWorkspaceProviderProps = {
  project: ProjectInfo;
  children: ReactNode;
};

export function DesignWorkspaceProvider({ project, children }: DesignWorkspaceProviderProps) {
  const [initial] = useState(() => loadDesignSet(project.path));
  const [state, setState] = useState<WorkspaceState>(() => ({
    set: initial.set,
    dirty: initial.status !== "restored",
    status: initial.status === "restored" ? "saved" : "saving",
    legacy: initial.status === "migrated",
    deleted: [],
  }));
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state.dirty) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (saveDesignSet(project.path, stateRef.current.set)) {
        if (stateRef.current.legacy) {
          clearLegacyDesign(project.path);
        }
        setState((current) => ({
          ...current,
          dirty: false,
          status: "saved",
          legacy: false,
        }));
      } else {
        setState((current) => ({ ...current, status: "error" }));
      }
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [project.path, state.dirty, state.set]);

  useEffect(() => {
    return () => {
      const current = stateRef.current;

      if (!current.dirty) {
        return;
      }

      if (saveDesignSet(project.path, current.set) && current.legacy) {
        clearLegacyDesign(project.path);
      }
    };
  }, [project.path]);

  const createCanvas = useCallback(() => {
    setState((current) => {
      const set = addCanvas(current.set);

      if (set === current.set) {
        return current;
      }

      return { ...current, set, dirty: true, status: "saving" };
    });
  }, []);

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

  const activeCanvas =
    state.set.canvases.find((canvas) => canvas.id === state.set.activeId) ?? state.set.canvases[0];

  const value = useMemo<DesignWorkspace>(
    () => ({
      canvases: state.set.canvases,
      activeCanvas,
      activeId: state.set.activeId,
      saveStatus: state.status,
      canDeleteCanvas: state.set.canvases.length > 1,
      atCanvasLimit: state.set.canvases.length >= MAX_CANVASES,
      deletedCanvases: state.deleted,
      createCanvas,
      selectCanvas: selectCanvasInSet,
      renameCanvas,
      deleteCanvas,
      undoDelete,
      dismissDelete,
      updateCanvasRoot,
    }),
    [
      activeCanvas,
      createCanvas,
      deleteCanvas,
      dismissDelete,
      renameCanvas,
      selectCanvasInSet,
      state.deleted,
      state.set,
      state.status,
      undoDelete,
      updateCanvasRoot,
    ],
  );

  return (
    <DesignWorkspaceContext.Provider value={value}>{children}</DesignWorkspaceContext.Provider>
  );
}
