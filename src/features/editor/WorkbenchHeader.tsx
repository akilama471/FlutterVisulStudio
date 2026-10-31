import { BrandMark } from "../../shared/components/BrandMark";
import { Icon } from "../../shared/components/Icon";
import type { ProjectInfo } from "../../shared/lib/project";

type WorkbenchHeaderProps = {
  project: ProjectInfo | null;
};

export function WorkbenchHeader({ project }: WorkbenchHeaderProps) {
  return (
    <header className="workbench-header">
      <div className="workbench-header__brand">
        <BrandMark size={26} />
        <span className="workbench-header__title">Flutter UI Studio</span>
        <span className="workbench-header__badge">Phase 1</span>
      </div>
      <span className="workbench-header__divider" aria-hidden="true" />
      <div className="workbench-header__context" title={project?.path}>
        <Icon name="folder" size={14} />
        <span>{project?.name ?? "No project open"}</span>
      </div>
      <span className="workbench-header__meta">
        {project ? "Flutter project" : "Desktop editor"}
      </span>
    </header>
  );
}
