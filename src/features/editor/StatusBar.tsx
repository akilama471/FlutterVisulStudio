import type { AppInfo } from "../../shared/lib/appInfo";

type StatusBarProps = {
  appInfo: AppInfo;
};

export function StatusBar({ appInfo }: StatusBarProps) {
  return (
    <footer className="status-bar" aria-label="Status bar">
      <div className="status-bar__group">
        <span className="status-bar__item">
          <span className="status-bar__dot" aria-hidden="true" />
          <span>Ready</span>
        </span>
        <span className="status-bar__item">No project open</span>
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
