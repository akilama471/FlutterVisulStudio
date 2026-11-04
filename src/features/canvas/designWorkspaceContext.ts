import { createContext, useContext } from "react";
import type { DesignCanvas } from "./designSet";
import type { DesignSaveStatus } from "./designStorage";
import type { CanvasNode } from "./model";

export type DesignWorkspace = {
  canvases: DesignCanvas[];
  activeCanvas: DesignCanvas;
  activeId: string;
  saveStatus: DesignSaveStatus;
  canDeleteCanvas: boolean;
  atCanvasLimit: boolean;
  deletedCanvas: DesignCanvas | null;
  createCanvas: () => void;
  selectCanvas: (id: string) => void;
  deleteCanvas: (id: string) => void;
  undoDelete: () => void;
  dismissDeleted: () => void;
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
