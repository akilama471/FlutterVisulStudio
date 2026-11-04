import { createContext, useContext } from "react";
import type { DesignCanvas, DesignSet, RemovedCanvas } from "./designSet";
import type { DesignSaveStatus } from "./designStorage";
import type { DesignSnapshot, SnapshotReason } from "./designSnapshots";
import type { DesignStorageUsage } from "./designStorageUsage";
import type { CanvasHistory, CanvasNode } from "./model";

export type DesignWorkspace = {
  canvases: DesignCanvas[];
  activeCanvas: DesignCanvas;
  activeId: string;
  projectName: string;
  revision: number;
  saveStatus: DesignSaveStatus;
  canDeleteCanvas: boolean;
  atCanvasLimit: boolean;
  deletedCanvases: readonly RemovedCanvas[];
  storageBytes: number;
  storageWarning: boolean;
  storageUsage: DesignStorageUsage;
  snapshots: readonly DesignSnapshot[];
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
  captureSnapshot: (reason: SnapshotReason) => boolean;
  applyImportedDesign: (set: DesignSet) => boolean;
  addImportedCanvas: (canvas: DesignCanvas) => boolean;
  restoreSnapshot: (id: string) => boolean;
  resetProjectDesign: () => boolean;
  refreshStorageUsage: () => void;
};

export const DesignWorkspaceContext = createContext<DesignWorkspace | null>(null);

export function useDesignWorkspace(): DesignWorkspace {
  const workspace = useContext(DesignWorkspaceContext);

  if (!workspace) {
    throw new Error("useDesignWorkspace must be used inside DesignWorkspaceProvider.");
  }

  return workspace;
}
