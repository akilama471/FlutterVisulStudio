import { createContext, useContext } from "react";
import type { DesignCanvas, RemovedCanvas } from "./designSet";
import type { DesignSaveStatus } from "./designStorage";
import type { CanvasNode } from "./model";

export type DesignWorkspace = {
  canvases: DesignCanvas[];
  activeCanvas: DesignCanvas;
  activeId: string;
  saveStatus: DesignSaveStatus;
  canDeleteCanvas: boolean;
  atCanvasLimit: boolean;
  deletedCanvases: readonly RemovedCanvas[];
  createCanvas: () => void;
  selectCanvas: (id: string) => void;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  undoDelete: (id: string) => void;
  dismissDelete: (id: string) => void;
  updateCanvasRoot: (id: string, root: CanvasNode) => void;
};

export const DesignWorkspaceContext = createContext<DesignWorkspace | null>(null);

export function useDesignWorkspace(): DesignWorkspace {
  const workspace = useContext(DesignWorkspaceContext);

  if (!workspace) {
    throw new Error("useDesignWorkspace must be used inside DesignWorkspaceProvider.");
  }

  return workspace;
}
