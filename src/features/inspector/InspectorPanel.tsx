import { EmptyState } from "../../shared/components/EmptyState";

export function InspectorPanel() {
  return (
    <aside className="side-panel side-panel--inspector" aria-label="Inspector">
      <div className="side-panel__header">
        <h2 className="side-panel__title">Inspector</h2>
      </div>
      <div className="side-panel__body">
        <EmptyState
          icon="sliders"
          title="Nothing selected"
          description="Widget properties will appear here once the visual canvas is available."
        />
      </div>
    </aside>
  );
}
