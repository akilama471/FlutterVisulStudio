import { useEffect, useMemo, useReducer, useRef } from "react";
import { EditorArea, type EditorTab } from "../features/editor/EditorArea";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { CanvasInspector } from "../features/canvas/CanvasInspector";
import { CanvasWorkspace } from "../features/canvas/CanvasWorkspace";
import type { DesignCanvas } from "../features/canvas/designSet";
import type { DesignSaveStatus } from "../features/canvas/designStorage";
import { useDesignWorkspace } from "../features/canvas/designWorkspaceContext";
import { canvasReducer, type CanvasNode, type CanvasState } from "../features/canvas/model";
import { DartPreview } from "../features/dart/DartPreview";
import { generateDart } from "../features/dart/generateDart";
import { FileEditor } from "../features/files/FileEditor";
import { FileInspector } from "../features/files/FileInspector";
import { fileName, fileTabId, useFileWorkspace } from "../features/files/fileWorkspaceContext";
import type { ProjectInfo } from "../shared/lib/project";

const DESIGN_TABS: EditorTab[] = [
  { id: "canvas", label: "Canvas", icon: "grid" },
  { id: "dart", label: "Dart", icon: "code" },
];

type DesignSurfaceProps = {
  project: ProjectInfo;
  showInspector: boolean;
};

export function DesignSurface({ project, showInspector }: DesignSurfaceProps) {
  const { activeCanvas, saveStatus, updateCanvasRoot } = useDesignWorkspace();

  return (
    <CanvasEditorSurface
      key={activeCanvas.id}
      project={project}
      canvas={activeCanvas}
      saveStatus={saveStatus}
      showInspector={showInspector}
      onRootChange={updateCanvasRoot}
    />
  );
}

type CanvasEditorSurfaceProps = {
  project: ProjectInfo;
  canvas: DesignCanvas;
  saveStatus: DesignSaveStatus;
  showInspector: boolean;
  onRootChange: (canvasId: string, root: CanvasNode) => void;
};

function CanvasEditorSurface({
  project,
  canvas,
  saveStatus,
  showInspector,
  onRootChange,
}: CanvasEditorSurfaceProps) {
  const [state, dispatch] = useReducer(canvasReducer, canvas.root, (root): CanvasState => ({
    root,
    selectedId: null,
    past: [],
    future: [],
    coalesceKey: null,
  }));
  const { activeTabId, activeFile, files, setActiveTab, requestCloseFile } = useFileWorkspace();
  const reportedRoot = useRef(canvas.root);
  const code = useMemo(() => generateDart(state.root), [state.root]);
  const tabs = useMemo<EditorTab[]>(
    () => [
      ...DESIGN_TABS,
      ...files.map((file) => ({
        id: fileTabId(file.relativePath),
        label: fileName(file.relativePath),
        icon: "file" as const,
        closable: true,
        dirty: file.contents !== file.savedContents,
        onClose: () => requestCloseFile(file.relativePath),
      })),
    ],
    [files, requestCloseFile],
  );

  useEffect(() => {
    if (state.root === reportedRoot.current) {
      return;
    }

    reportedRoot.current = state.root;
    onRootChange(canvas.id, state.root);
  }, [canvas.id, onRootChange, state.root]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function selectView(id: string) {
    setActiveTab(id);
  }

  return (
    <>
      <EditorArea tabs={tabs} activeTabId={activeTabId} onSelectTab={selectView}>
        {activeTabId === "dart" ? (
          <DartPreview code={code} project={project} />
        ) : activeFile ? (
          <FileEditor file={activeFile} />
        ) : (
          <CanvasWorkspace
            canvas={state}
            dispatch={dispatch}
            projectName={project.name}
            canvasName={canvas.name}
            saveStatus={saveStatus}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
          />
        )}
      </EditorArea>
      {showInspector ? (
        <InspectorPanel>
          {activeFile ? (
            <FileInspector file={activeFile} />
          ) : (
            <CanvasInspector canvas={state} dispatch={dispatch} />
          )}
        </InspectorPanel>
      ) : null}
    </>
  );
}
