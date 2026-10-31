import type { ReactNode } from "react";

type InspectorPanelProps = {
  children: ReactNode;
};

export function InspectorPanel({ children }: InspectorPanelProps) {
  return (
    <aside className="side-panel side-panel--inspector" aria-label="Inspector">
      <div className="side-panel__header">
        <h2 className="side-panel__title">Inspector</h2>
      </div>
      <div className="side-panel__body">{children}</div>
    </aside>
  );
}
