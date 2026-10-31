import { Icon } from "../../shared/components/Icon";
import { EditorWelcome } from "./EditorWelcome";

export function EditorArea() {
  return (
    <main className="workspace" aria-label="Editor">
      <div className="tab-bar">
        <div className="editor-tab editor-tab--active" aria-current="page">
          <Icon name="file" size={13} />
          <span>Welcome</span>
        </div>
      </div>
      <EditorWelcome />
    </main>
  );
}
