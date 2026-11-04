import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  projectErrorMessage,
  readProjectTextFile,
  statProjectTextFile,
  writeProjectTextFile,
} from "../../shared/lib/project";
import { DiscardFileDialog } from "./DiscardFileDialog";
import {
  FileWorkspaceContext,
  fileTabId,
  type FileWorkspace,
  type OpenFile,
} from "./fileWorkspaceContext";

const CHANGED_ON_DISK = "The file changed on disk.";

type WorkspaceState = {
  files: OpenFile[];
  activeTabId: string;
  pendingClosePath: string | null;
  refreshToken: number;
};

type FileWorkspaceProviderProps = {
  children: ReactNode;
};

export function FileWorkspaceProvider({ children }: FileWorkspaceProviderProps) {
  const [state, setState] = useState<WorkspaceState>({
    files: [],
    activeTabId: "canvas",
    pendingClosePath: null,
    refreshToken: 0,
  });
  const stateRef = useRef(state);

  const commit = useCallback((update: (current: WorkspaceState) => WorkspaceState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const patchFile = useCallback(
    (relativePath: string, update: (file: OpenFile) => OpenFile) => {
      commit((current) => {
        let changed = false;
        const files = current.files.map((file) => {
          if (file.relativePath !== relativePath) {
            return file;
          }

          const next = update(file);
          changed = changed || next !== file;
          return next;
        });

        return changed ? { ...current, files } : current;
      });
    },
    [commit],
  );

  const loadFile = useCallback(
    async (relativePath: string, initial: boolean) => {
      if (initial) {
        patchFile(relativePath, (file) => ({
          ...file,
          status: "loading",
          error: null,
          saveError: null,
          externalChange: false,
        }));
      }

      try {
        const loaded = await readProjectTextFile(relativePath);
        patchFile(relativePath, (file) => ({
          ...file,
          status: "ready",
          contents: loaded.contents,
          savedContents: loaded.contents,
          modifiedMs: loaded.modifiedMs,
          error: null,
          saveError: null,
          externalChange: false,
          saving: false,
        }));
      } catch (error) {
        const message = projectErrorMessage(error, "The file could not be read.");

        if (initial) {
          patchFile(relativePath, (file) => ({
            ...file,
            status: "error",
            error: message,
            saving: false,
          }));
        } else {
          patchFile(relativePath, (file) => ({ ...file, saveError: message, saving: false }));
        }
      }
    },
    [patchFile],
  );

  const openFile = useCallback(
    (relativePath: string) => {
      const existing = stateRef.current.files.find((file) => file.relativePath === relativePath);

      if (existing) {
        commit((current) => ({ ...current, activeTabId: fileTabId(relativePath) }));
        return;
      }

      const file: OpenFile = {
        relativePath,
        contents: "",
        savedContents: "",
        modifiedMs: 0,
        status: "loading",
        error: null,
        saving: false,
        saveError: null,
        externalChange: false,
        backupPath: null,
      };

      commit((current) => ({
        ...current,
        files: [...current.files, file],
        activeTabId: fileTabId(relativePath),
      }));
      void loadFile(relativePath, true);
    },
    [commit, loadFile],
  );

  const setActiveTab = useCallback(
    (tabId: string) => {
      if (tabId === "canvas" || tabId === "dart") {
        commit((current) => ({ ...current, activeTabId: tabId }));
        return;
      }

      if (
        tabId.startsWith("file:") &&
        stateRef.current.files.some((file) => fileTabId(file.relativePath) === tabId)
      ) {
        commit((current) => ({ ...current, activeTabId: tabId }));
      }
    },
    [commit],
  );

  const updateFileContents = useCallback(
    (relativePath: string, contents: string) => {
      patchFile(relativePath, (file) =>
        file.status === "ready" ? { ...file, contents, saveError: null } : file,
      );
    },
    [patchFile],
  );

  const saveFile = useCallback(
    (relativePath: string, options?: { force?: boolean }) => {
      const file = stateRef.current.files.find(
        (candidate) => candidate.relativePath === relativePath,
      );

      if (!file || file.status !== "ready" || file.saving || file.contents === file.savedContents) {
        return;
      }

      const sentContents = file.contents;
      const expectedModifiedMs = options?.force ? null : file.modifiedMs;

      patchFile(relativePath, (current) => ({
        ...current,
        saving: true,
        saveError: null,
      }));

      void writeProjectTextFile(relativePath, sentContents, expectedModifiedMs)
        .then((result) => {
          patchFile(relativePath, (current) => ({
            ...current,
            saving: false,
            savedContents: sentContents,
            modifiedMs: result.modifiedMs,
            backupPath: result.backupPath,
            saveError: null,
            externalChange: false,
            error: null,
            status: "ready",
          }));
          commit((current) => ({ ...current, refreshToken: current.refreshToken + 1 }));
        })
        .catch((error) => {
          const message = projectErrorMessage(error, "The file could not be written.");
          patchFile(relativePath, (current) => ({
            ...current,
            saving: false,
            saveError: message,
            externalChange: message.startsWith(CHANGED_ON_DISK) || current.externalChange,
          }));
        });
    },
    [commit, patchFile],
  );

  const reloadFile = useCallback(
    (relativePath: string) => {
      void loadFile(relativePath, false);
    },
    [loadFile],
  );

  const checkOne = useCallback(
    async (relativePath: string) => {
      const file = stateRef.current.files.find(
        (candidate) => candidate.relativePath === relativePath,
      );

      if (!file || file.status !== "ready" || file.saving) {
        return;
      }

      try {
        const stat = await statProjectTextFile(relativePath);
        const latest = stateRef.current.files.find(
          (candidate) => candidate.relativePath === relativePath,
        );

        if (!latest || latest.status !== "ready" || latest.saving) {
          return;
        }

        if (stat.modifiedMs === latest.modifiedMs) {
          return;
        }

        if (latest.contents === latest.savedContents) {
          const loaded = await readProjectTextFile(relativePath);
          patchFile(relativePath, (current) => ({
            ...current,
            contents: loaded.contents,
            savedContents: loaded.contents,
            modifiedMs: loaded.modifiedMs,
            status: "ready",
            error: null,
            saveError: null,
            externalChange: false,
          }));
        } else {
          patchFile(relativePath, (current) => ({ ...current, externalChange: true }));
        }
      } catch (error) {
        patchFile(relativePath, (current) => ({
          ...current,
          externalChange: true,
          saveError: projectErrorMessage(error, "The file could not be checked."),
        }));
      }
    },
    [patchFile],
  );

  const checkExternalChanges = useCallback(() => {
    for (const file of stateRef.current.files) {
      if (file.status === "ready") {
        void checkOne(file.relativePath);
      }
    }
  }, [checkOne]);

  const refreshFiles = useCallback(() => {
    commit((current) => ({ ...current, refreshToken: current.refreshToken + 1 }));
  }, [commit]);

  const closePath = useCallback(
    (relativePath: string) => {
      commit((current) => {
        const index = current.files.findIndex((file) => file.relativePath === relativePath);

        if (index === -1) {
          return { ...current, pendingClosePath: null };
        }

        const files = current.files.filter((file) => file.relativePath !== relativePath);
        let activeTabId = current.activeTabId;

        if (activeTabId === fileTabId(relativePath)) {
          const next = files[Math.min(index, files.length - 1)];
          activeTabId = next ? fileTabId(next.relativePath) : "canvas";
        }

        return { ...current, files, activeTabId, pendingClosePath: null };
      });
    },
    [commit],
  );

  const requestCloseFile = useCallback(
    (relativePath: string) => {
      const file = stateRef.current.files.find(
        (candidate) => candidate.relativePath === relativePath,
      );

      if (!file) {
        return;
      }

      if (file.contents !== file.savedContents) {
        commit((current) => ({ ...current, pendingClosePath: relativePath }));
        return;
      }

      closePath(relativePath);
    },
    [closePath, commit],
  );

  const confirmCloseFile = useCallback(() => {
    const path = stateRef.current.pendingClosePath;

    if (path) {
      closePath(path);
    }
  }, [closePath]);

  const cancelCloseFile = useCallback(() => {
    commit((current) => ({ ...current, pendingClosePath: null }));
  }, [commit]);

  useEffect(() => {
    const handleFocus = () => checkExternalChanges();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checkExternalChanges]);

  useEffect(() => {
    if (state.activeTabId.startsWith("file:")) {
      void checkOne(state.activeTabId.slice("file:".length));
    }
  }, [checkOne, state.activeTabId]);

  useEffect(() => {
    const dirty = state.files.some(
      (file) => file.status === "ready" && file.contents !== file.savedContents,
    );

    if (!dirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.files]);

  const activeFile =
    state.files.find((file) => fileTabId(file.relativePath) === state.activeTabId) ?? null;
  const pendingClose =
    state.files.find((file) => file.relativePath === state.pendingClosePath) ?? null;
  const pendingClosePath = pendingClose?.relativePath ?? null;

  const workspace: FileWorkspace = {
    files: state.files,
    activeTabId: state.activeTabId,
    activeFile,
    pendingClose,
    refreshToken: state.refreshToken,
    openFile,
    requestCloseFile,
    confirmCloseFile,
    cancelCloseFile,
    setActiveTab,
    updateFileContents,
    saveFile,
    reloadFile,
    checkExternalChanges,
    refreshFiles,
  };

  return (
    <FileWorkspaceContext.Provider value={workspace}>
      {children}
      {pendingClosePath ? (
        <DiscardFileDialog
          relativePath={pendingClosePath}
          onCancel={cancelCloseFile}
          onConfirm={confirmCloseFile}
        />
      ) : null}
    </FileWorkspaceContext.Provider>
  );
}
