import { BrandMark } from "../../shared/components/BrandMark";
import { Button } from "../../shared/components/Button";
import { Icon } from "../../shared/components/Icon";
import type { ProjectStatus } from "../project/useProjectWorkspace";

const plannedCapabilities = [
  { icon: "layers", label: "Project workspace" },
  { icon: "grid", label: "Visual canvas" },
  { icon: "code", label: "Dart generation" },
  { icon: "file", label: "Saved designs" },
  { icon: "sparkles", label: "Safe project writes" },
  { icon: "layers", label: "Multiple canvases" },
  { icon: "undo", label: "Undo and redo" },
  { icon: "file", label: "Project file editing" },
  { icon: "layers", label: "Drag, drop, and multi-select" },
  { icon: "database", label: "Portable design files" },
] as const;

type EditorWelcomeProps = {
  status: ProjectStatus;
  onOpenProject: () => void;
};

export function EditorWelcome({ status, onOpenProject }: EditorWelcomeProps) {
  const busy = status !== "idle";

  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome__content">
        <BrandMark size={56} className="welcome__mark" />
        <p className="welcome__eyebrow">Visual Flutter desktop studio</p>
        <h1 id="welcome-title" className="welcome__title">
          Flutter UI Studio
        </h1>
        <p className="welcome__description">
          Compose Flutter interfaces visually and keep the generated Dart readable, owned, and ready
          for production.
        </p>
        <ul className="welcome__roadmap" aria-label="Capabilities available today">
          {plannedCapabilities.map((capability) => (
            <li key={capability.label}>
              <Icon name={capability.icon} size={14} />
              <span>{capability.label}</span>
            </li>
          ))}
        </ul>
        <div className="welcome__actions">
          <Button variant="primary" icon="folder" disabled={busy} onClick={onOpenProject}>
            Open Flutter project
          </Button>
        </div>
        <p className="welcome__note">
          Phase 10 makes designs portable: export a project or one canvas to JSON, import it only
          after a validated preview, restore from rotating snapshots, and keep an optional copy in
          the project folder. Open a project to start composing.
        </p>
      </div>
    </section>
  );
}
