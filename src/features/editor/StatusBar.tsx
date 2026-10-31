import type { AppInfo } from "../../shared/lib/appInfo";
import type { ProjectInfo } from "../../shared/lib/project";
import type { ProjectStatus } from "../project/useProjectWorkspace";

type StatusBarProps = {
  appInfo: AppInfo;
  project: ProjectInfo | null;
  status: ProjectStatus;
};

export function StatusBar({ appInfo, project, status }: StatusBarProps) {
  const statusLabel =
    status === "restoring"
      ? "Restoring project"
      : status === "opening"
        ? "Opening project"
        : "Ready";

  return (
    <footer className="status-bar" aria-label="Status bar">
      <div className="status-bar__group">
        <span className="status-bar__item">
          <span
            className={
              status === "idle" ? "status-bar__dot" : "status-bar__dot status-bar__dot--busy"
            }
            aria-hidden="true"
          />
          <span>{statusLabel}</span>
        </span>
        <span className="status-bar__item status-bar__item--project" title={project?.path}>
          <span className="status-bar__project-name">{project?.name ?? "No project open"}</span>
        </span>
      </div>
      <div className="status-bar__group">
        <span className="status-bar__item status-bar__item--optional">UTF-8</span>
        <span className="status-bar__item status-bar__item--optional">LF</span>
        <span className="status-bar__item" title="Tauri runtime version">
          Tauri {appInfo.tauriVersion}
        </span>
        <span className="status-bar__item" title="Application version">
          v{appInfo.version}
        </span>
      </div>
    </footer>
  );
}
