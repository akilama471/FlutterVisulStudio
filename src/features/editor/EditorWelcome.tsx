import { BrandMark } from "../../shared/components/BrandMark";
import { Button } from "../../shared/components/Button";
import { Icon } from "../../shared/components/Icon";
import type { ProjectStatus } from "../project/useProjectWorkspace";

const plannedCapabilities = [
  { icon: "layers", label: "Project workspace" },
  { icon: "grid", label: "Visual canvas" },
  { icon: "code", label: "Dart generation" },
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
        <ul className="welcome__roadmap" aria-label="Capabilities planned for upcoming phases">
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
          Phase 1 added project opening and file browsing. Open a project to start composing on the
          in-memory visual canvas.
        </p>
      </div>
    </section>
  );
}
