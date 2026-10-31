import { useState } from "react";
import { Icon } from "../../shared/components/Icon";
import {
  listProjectDirectory,
  projectErrorMessage,
  type ProjectEntry,
} from "../../shared/lib/project";

type ChildState =
  | { status: "loading"; entries: ProjectEntry[] }
  | { status: "loaded"; entries: ProjectEntry[] }
  | { status: "error"; entries: ProjectEntry[]; error: string };

type ProjectTreeProps = {
  entries: ProjectEntry[];
};

export function ProjectTree({ entries }: ProjectTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [children, setChildren] = useState<Record<string, ChildState>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  async function loadChildren(relativePath: string) {
    setChildren((current) => ({
      ...current,
      [relativePath]: { status: "loading", entries: [] },
    }));

    try {
      const loadedEntries = await listProjectDirectory(relativePath);
      setChildren((current) => ({
        ...current,
        [relativePath]: { status: "loaded", entries: loadedEntries },
      }));
    } catch (error) {
      setChildren((current) => ({
        ...current,
        [relativePath]: {
          status: "error",
          entries: [],
          error: projectErrorMessage(error),
        },
      }));
    }
  }

  function toggleDirectory(entry: ProjectEntry) {
    const isOpen = expanded.has(entry.relativePath);

    if (isOpen) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(entry.relativePath);
        return next;
      });
      return;
    }

    setExpanded((current) => new Set(current).add(entry.relativePath));
    const state = children[entry.relativePath];
    if (!state || state.status === "error") {
      void loadChildren(entry.relativePath);
    }
  }

  function renderEntries(items: ProjectEntry[], depth: number) {
    return (
      <ul className={depth === 0 ? "project-tree" : "project-tree project-tree--nested"}>
        {items.map((entry) => {
          const isDirectory = entry.kind === "directory";
          const canExpand = isDirectory && entry.hasChildren;
          const isOpen = expanded.has(entry.relativePath);
          const childState = children[entry.relativePath];

          return (
            <li key={entry.relativePath} className="project-tree__item">
              <button
                type="button"
                className={
                  selectedPath === entry.relativePath ? "tree-row tree-row--selected" : "tree-row"
                }
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                aria-expanded={isDirectory ? isOpen : undefined}
                aria-current={selectedPath === entry.relativePath ? "true" : undefined}
                onClick={() =>
                  isDirectory ? toggleDirectory(entry) : setSelectedPath(entry.relativePath)
                }
              >
                <span className="tree-row__chevron">
                  {canExpand ? (
                    <Icon
                      name="chevron"
                      size={12}
                      className={
                        isOpen ? "tree-row__chevron-icon is-open" : "tree-row__chevron-icon"
                      }
                    />
                  ) : null}
                </span>
                <Icon
                  name={isDirectory ? "folder" : "file"}
                  size={14}
                  className={
                    isDirectory ? "tree-row__icon tree-row__icon--folder" : "tree-row__icon"
                  }
                />
                <span className="tree-row__label">{entry.name}</span>
              </button>

              {canExpand && isOpen ? (
                <div className="project-tree__children">
                  {childState?.status === "loading" ? (
                    <p className="tree-note" style={{ paddingLeft: `${30 + depth * 14}px` }}>
                      Loading…
                    </p>
                  ) : null}
                  {childState?.status === "error" ? (
                    <p
                      className="tree-note tree-note--error"
                      role="alert"
                      style={{ paddingLeft: `${30 + depth * 14}px` }}
                    >
                      {childState.error}
                    </p>
                  ) : null}
                  {childState?.status === "loaded" && childState.entries.length === 0 ? (
                    <p className="tree-note" style={{ paddingLeft: `${30 + depth * 14}px` }}>
                      Empty folder
                    </p>
                  ) : null}
                  {childState?.status === "loaded"
                    ? renderEntries(childState.entries, depth + 1)
                    : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return renderEntries(entries, 0);
}
