import { BrandMark } from "../../shared/components/BrandMark";
import { Button } from "../../shared/components/Button";
import { Icon } from "../../shared/components/Icon";
import type { ProjectInfo } from "../../shared/lib/project";
import type { ProjectStatus } from "../project/useProjectWorkspace";

const plannedCapabilities = [
  { icon: "layers", label: "Project workspace" },
  { icon: "grid", label: "Visual canvas" },
  { icon: "code", label: "Dart generation" },
] as const;

type EditorWelcomeProps = {
  project: ProjectInfo | null;
  status: ProjectStatus;
  onOpenProject: () => void;
};

export function EditorWelcome({ project, status, onOpenProject }: EditorWelcomeProps) {
  const busy = status !== "idle";

  if (project) {
    return (
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome__content">
          <BrandMark size={56} className="welcome__mark" />
          <p className="welcome__eyebrow">Flutter project loaded</p>
          <h1 id="welcome-title" className="welcome__title">
            {project.name}
          </h1>
          <p className="welcome__path">{project.path}</p>
          <ul className="welcome__details" aria-label="Project details">
            <li>
              <Icon name="code" size={14} />
              <span>{project.entryPoint ?? "No lib/main.dart found"}</span>
            </li>
            <li>
              <Icon name="folder" size={14} />
              <span>Browse the file tree in the explorer</span>
            </li>
          </ul>
          <div className="welcome__actions">
            <Button variant="primary" icon="folder" disabled={busy} onClick={onOpenProject}>
              Open another project
            </Button>
          </div>
          <p className="welcome__note">
            Phase 1 loads and browses project files. Visual editing arrives in later phases.
          </p>
        </div>
      </section>
    );
  }

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
          Phase 1 adds project opening and file browsing. Visual editing arrives in later phases.
        </p>
      </div>
    </section>
  );
}
