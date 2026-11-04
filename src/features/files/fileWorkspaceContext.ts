import { createContext, useContext } from "react";

export type FileStatus = "loading" | "ready" | "error";

export type OpenFile = {
  relativePath: string;
  contents: string;
  savedContents: string;
  modifiedMs: number;
  status: FileStatus;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  externalChange: boolean;
  backupPath: string | null;
};

export type FileWorkspace = {
  files: OpenFile[];
  activeTabId: string;
  activeFile: OpenFile | null;
  pendingClose: OpenFile | null;
  refreshToken: number;
  openFile: (relativePath: string) => void;
  requestCloseFile: (relativePath: string) => void;
  confirmCloseFile: () => void;
  cancelCloseFile: () => void;
  setActiveTab: (tabId: string) => void;
  updateFileContents: (relativePath: string, contents: string) => void;
  saveFile: (relativePath: string, options?: { force?: boolean }) => void;
  reloadFile: (relativePath: string) => void;
  checkExternalChanges: () => void;
  refreshFiles: () => void;
};

export function fileTabId(relativePath: string): string {
  return `file:${relativePath}`;
}

export function fileName(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

export const FileWorkspaceContext = createContext<FileWorkspace | null>(null);

export function useFileWorkspace(): FileWorkspace {
  const value = useContext(FileWorkspaceContext);

  if (!value) {
    throw new Error("useFileWorkspace must be used inside FileWorkspaceProvider");
  }

  return value;
}
