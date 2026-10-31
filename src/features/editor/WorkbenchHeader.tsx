import { BrandMark } from "../../shared/components/BrandMark";
import { Icon } from "../../shared/components/Icon";

export function WorkbenchHeader() {
  return (
    <header className="workbench-header">
      <div className="workbench-header__brand">
        <BrandMark size={26} />
        <span className="workbench-header__title">Flutter UI Studio</span>
        <span className="workbench-header__badge">Phase 0</span>
      </div>
      <span className="workbench-header__divider" aria-hidden="true" />
      <div className="workbench-header__context">
        <Icon name="folder" size={14} />
        <span>No project open</span>
      </div>
      <span className="workbench-header__meta">Desktop editor</span>
    </header>
  );
}
