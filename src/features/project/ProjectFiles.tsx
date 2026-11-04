import { useEffect, useState } from "react";
import {
  listProjectDirectory,
  projectErrorMessage,
  type ProjectEntry,
  type ProjectInfo,
} from "../../shared/lib/project";
import { ProjectTree } from "./ProjectTree";

type TreeState =
  | { status: "loading"; entries: ProjectEntry[]; error: null }
  | { status: "loaded"; entries: ProjectEntry[]; error: null }
  | { status: "error"; entries: ProjectEntry[]; error: string };

type ProjectFilesProps = {
  project: ProjectInfo;
  onOpenFile: (relativePath: string) => void;
  refreshToken: number;
};

export function ProjectFiles({ project, onOpenFile, refreshToken }: ProjectFilesProps) {
  const [tree, setTree] = useState<TreeState>({
    status: "loading",
    entries: [],
    error: null,
  });

  useEffect(() => {
    let active = true;

    void listProjectDirectory("")
      .then((entries) => {
        if (active) {
          setTree({ status: "loaded", entries, error: null });
        }
      })
      .catch((treeError) => {
        if (active) {
          setTree({ status: "error", entries: [], error: projectErrorMessage(treeError) });
        }
      });

    return () => {
      active = false;
    };
  }, [project.path, refreshToken]);

  if (tree.status === "loading") {
    return <p className="panel-note">Loading project files…</p>;
  }

  if (tree.status === "error") {
    return (
      <p className="panel-alert" role="alert">
        {tree.error}
      </p>
    );
  }

  if (tree.entries.length === 0) {
    return <p className="panel-note">This project has no files to show.</p>;
  }

  return <ProjectTree entries={tree.entries} onOpenFile={onOpenFile} refreshToken={refreshToken} />;
}
