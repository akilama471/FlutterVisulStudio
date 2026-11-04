import { Button } from "../../shared/components/Button";
import { EmptyState } from "../../shared/components/EmptyState";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/IconButton";
import { CanvasList } from "../canvas/CanvasList";
import type { ProjectInfo } from "../../shared/lib/project";
import { ProjectFiles } from "./ProjectFiles";
import type { ProjectStatus } from "./useProjectWorkspace";

type ProjectExplorerProps = {
  project: ProjectInfo | null;
  status: ProjectStatus;
  error: string | null;
  onOpenProject: () => void;
};

export function ProjectExplorer({ project, status, error, onOpenProject }: ProjectExplorerProps) {
  const busy = status === "restoring" || status === "opening";

  return (
    <aside className="side-panel side-panel--explorer" aria-label="Explorer">
      <div className="side-panel__header">
        <h2 className="side-panel__title">Explorer</h2>
        <IconButton
          className="side-panel__action"
          label="Open project folder"
          icon="folder"
          disabled={busy}
          onClick={onOpenProject}
        />
      </div>

      <div className="side-panel__body side-panel__body--explorer">
        {error ? (
          <p className="panel-alert" role="alert">
            {error}
          </p>
        ) : null}

        {project ? (
          <>
            <div className="project-summary" title={project.path}>
              <Icon name="folder" size={14} className="project-summary__icon" />
              <span className="project-summary__name">{project.name}</span>
            </div>
            <CanvasList />
            <ProjectFiles key={project.path} project={project} />
          </>
        ) : status === "restoring" ? (
          <EmptyState
            icon="folder"
            title="Restoring project"
            description="Reopening your last Flutter project."
          />
        ) : status === "opening" ? (
          <EmptyState
            icon="folder"
            title="Opening project"
            description="Checking the folder and reading its files."
          />
        ) : (
          <EmptyState
            icon="folder"
            title="No project open"
            description="Open a Flutter project to browse its files here."
            action={
              <Button icon="folder" onClick={onOpenProject}>
                Open Flutter project
              </Button>
            }
          />
        )}
      </div>
    </aside>
  );
}
