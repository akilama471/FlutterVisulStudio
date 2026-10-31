import type { ProjectInfo } from "../../shared/lib/project";
import type { ProjectStatus } from "../project/useProjectWorkspace";
import { Icon } from "../../shared/components/Icon";
import { EditorWelcome } from "./EditorWelcome";

type EditorAreaProps = {
  project: ProjectInfo | null;
  status: ProjectStatus;
  onOpenProject: () => void;
};

export function EditorArea({ project, status, onOpenProject }: EditorAreaProps) {
  return (
    <main className="workspace" aria-label="Editor">
      <div className="tab-bar">
        <div className="editor-tab editor-tab--active" aria-current="page">
          <Icon name={project ? "folder" : "file"} size={13} />
          <span>{project?.name ?? "Welcome"}</span>
        </div>
      </div>
      <EditorWelcome project={project} status={status} onOpenProject={onOpenProject} />
    </main>
  );
}
