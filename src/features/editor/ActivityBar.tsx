import { IconButton } from "../../shared/components/IconButton";

type ActivityBarProps = {
  explorerOpen: boolean;
  inspectorOpen: boolean;
  onToggleExplorer: () => void;
  onToggleInspector: () => void;
};

export function ActivityBar({
  explorerOpen,
  inspectorOpen,
  onToggleExplorer,
  onToggleInspector,
}: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="Activity bar">
      <div className="activity-bar__group">
        <IconButton
          className="activity-button"
          label="Toggle Explorer"
          icon="folder"
          active={explorerOpen}
          onClick={onToggleExplorer}
        />
        <IconButton
          className="activity-button"
          label="Toggle Inspector"
          icon="sliders"
          active={inspectorOpen}
          onClick={onToggleInspector}
        />
      </div>
    </nav>
  );
}
