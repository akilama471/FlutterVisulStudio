import type { ReactNode } from "react";
import { Icon, type IconName } from "../../shared/components/Icon";

type EditorAreaProps = {
  tabLabel: string;
  tabIcon?: IconName;
  children: ReactNode;
};

export function EditorArea({ tabLabel, tabIcon = "file", children }: EditorAreaProps) {
  return (
    <main className="workspace" aria-label="Editor">
      <div className="tab-bar">
        <div className="editor-tab editor-tab--active" aria-current="page">
          <Icon name={tabIcon} size={13} />
          <span>{tabLabel}</span>
        </div>
      </div>
      {children}
    </main>
  );
}
