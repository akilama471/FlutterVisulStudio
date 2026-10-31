import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../../shared/components/Icon";

export type EditorTab = {
  id: string;
  label: string;
  icon?: IconName;
};

type EditorAreaProps = {
  tabs: EditorTab[];
  activeTabId: string;
  onSelectTab?: (id: string) => void;
  children: ReactNode;
};

export function EditorArea({ tabs, activeTabId, onSelectTab, children }: EditorAreaProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  function selectTab(id: string) {
    onSelectTab?.(id);
    tabRefs.current.get(id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    selectTab(tabs[nextIndex].id);
  }

  return (
    <main className="workspace" aria-label="Editor">
      <div className="tab-bar" role="tablist" aria-label="Editor tabs">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId;

          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(tab.id, node);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="editor-panel"
              tabIndex={active ? 0 : -1}
              className={active ? "editor-tab editor-tab--active" : "editor-tab"}
              onClick={() => onSelectTab?.(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <Icon name={tab.icon ?? "file"} size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="editor-panel" id="editor-panel" role="tabpanel" aria-label={activeTab?.label}>
        {children}
      </div>
    </main>
  );
}
