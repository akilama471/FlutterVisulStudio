import { useCallback, useEffect, useRef, useState } from "react";
import {
  openProject,
  projectErrorMessage,
  selectProjectFolder,
  type ProjectInfo,
} from "../../shared/lib/project";
import { forgetProject, readRecentProject, rememberProject } from "./projectStorage";

export type ProjectStatus = "idle" | "restoring" | "opening";

export type ProjectWorkspace = {
  project: ProjectInfo | null;
  status: ProjectStatus;
  error: string | null;
  openProjectFromPicker: () => void;
};

export function useProjectWorkspace(): ProjectWorkspace {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [status, setStatus] = useState<ProjectStatus>(() =>
    readRecentProject() ? "restoring" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const recentPath = readRecentProject();
    if (!recentPath) {
      return;
    }

    let active = true;

    void openProject(recentPath)
      .then((restoredProject) => {
        if (!active) {
          return;
        }

        setProject(restoredProject);
        rememberProject(restoredProject.path);
      })
      .catch(() => {
        if (active) {
          forgetProject();
        }
      })
      .finally(() => {
        if (active) {
          setStatus("idle");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const openProjectFromPicker = useCallback(() => {
    if (busy.current) {
      return;
    }

    void (async () => {
      setError(null);

      let selectedPath: string | null;
      try {
        selectedPath = await selectProjectFolder();
      } catch (pickerError) {
        setError(projectErrorMessage(pickerError));
        return;
      }

      if (!selectedPath) {
        return;
      }

      busy.current = true;
      setStatus("opening");

      try {
        const openedProject = await openProject(selectedPath);
        setProject(openedProject);
        rememberProject(openedProject.path);
      } catch (openError) {
        setError(projectErrorMessage(openError));
      } finally {
        busy.current = false;
        setStatus("idle");
      }
    })();
  }, []);

  return { project, status, error, openProjectFromPicker };
}
