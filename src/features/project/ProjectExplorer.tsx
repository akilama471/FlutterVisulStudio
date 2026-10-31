import { EmptyState } from "../../shared/components/EmptyState";

export function ProjectExplorer() {
  return (
    <aside className="side-panel side-panel--explorer" aria-label="Explorer">
      <div className="side-panel__header">
        <h2 className="side-panel__title">Explorer</h2>
      </div>
      <div className="side-panel__body">
        <EmptyState
          icon="folder"
          title="No project open"
          description="Open a Flutter project to browse its files here. Project management arrives in a later phase."
        />
      </div>
    </aside>
  );
}
