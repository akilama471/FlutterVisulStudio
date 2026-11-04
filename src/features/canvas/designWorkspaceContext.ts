import { createContext, useContext } from "react";
import type { DesignCanvas, RemovedCanvas } from "./designSet";
import type { DesignSaveStatus } from "./designStorage";
import type { CanvasHistory, CanvasNode } from "./model";

export type DesignWorkspace = {
  canvases: DesignCanvas[];
  activeCanvas: DesignCanvas;
  activeId: string;
  saveStatus: DesignSaveStatus;
  canDeleteCanvas: boolean;
  atCanvasLimit: boolean;
  deletedCanvases: readonly RemovedCanvas[];
  storageBytes: number;
  storageWarning: boolean;
  clipboard: readonly CanvasNode[];
  createCanvas: () => void;
  duplicateCanvas: (id: string) => void;
  reorderCanvas: (id: string, targetId: string, position: "before" | "after") => void;
  selectCanvas: (id: string) => void;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  undoDelete: (id: string) => void;
  dismissDelete: (id: string) => void;
  updateCanvasRoot: (id: string, root: CanvasNode) => void;
  copySelection: (canvasId: string, ids: readonly string[]) => void;
  loadCanvasHistory: (canvasId: string, root: CanvasNode) => CanvasHistory | null;
  saveCanvasHistory: (canvasId: string, root: CanvasNode, history: CanvasHistory) => void;
};

export const DesignWorkspaceContext = createContext<DesignWorkspace | null>(null);

export function useDesignWorkspace(): DesignWorkspace {
  const workspace = useContext(DesignWorkspaceContext);

  if (!workspace) {
    throw new Error("useDesignWorkspace must be used inside DesignWorkspaceProvider.");
  }

  return workspace;
}
