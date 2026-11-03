import { useEffect, useMemo, useReducer, useState } from "react";
import { EditorArea, type EditorTab } from "../features/editor/EditorArea";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { CanvasInspector } from "../features/canvas/CanvasInspector";
import { CanvasWorkspace } from "../features/canvas/CanvasWorkspace";
import {
  canvasReducer,
  createInitialCanvasState,
  type CanvasNode,
  type CanvasState,
} from "../features/canvas/model";
import { loadDesign, saveDesign, type DesignSaveStatus } from "../features/canvas/designStorage";
import { DartPreview } from "../features/dart/DartPreview";
import { generateDart } from "../features/dart/generateDart";
import type { ProjectInfo } from "../shared/lib/project";

const DESIGN_TABS: EditorTab[] = [
  { id: "canvas", label: "Canvas", icon: "grid" },
  { id: "dart", label: "Dart", icon: "code" },
];

const AUTOSAVE_DELAY = 250;

type DesignView = "canvas" | "dart";

type DesignSurfaceProps = {
  project: ProjectInfo;
  showInspector: boolean;
};

export function DesignSurface({ project, showInspector }: DesignSurfaceProps) {
  const [initial] = useState(() => loadDesign(project.path));
  const [canvas, dispatch] = useReducer(canvasReducer, initial.root, (savedRoot): CanvasState =>
    savedRoot ? { root: savedRoot, selectedId: null } : createInitialCanvasState(),
  );
  const [view, setView] = useState<DesignView>("canvas");
  const [savedRoot, setSavedRoot] = useState<CanvasNode | null>(() =>
    initial.status === "restored" ? initial.root : null,
  );
  const [failedRoot, setFailedRoot] = useState<CanvasNode | null>(null);
  const saveStatus: DesignSaveStatus =
    failedRoot === canvas.root ? "error" : savedRoot === canvas.root ? "saved" : "saving";
  const code = useMemo(() => generateDart(canvas.root), [canvas.root]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (saveDesign(project.path, canvas.root)) {
        setFailedRoot(null);
        setSavedRoot(canvas.root);
      } else {
        setFailedRoot(canvas.root);
      }
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [canvas.root, project.path]);

  function selectView(id: string) {
    setView(id === "dart" ? "dart" : "canvas");
  }

  return (
    <>
      <EditorArea tabs={DESIGN_TABS} activeTabId={view} onSelectTab={selectView}>
        {view === "canvas" ? (
          <CanvasWorkspace
            canvas={canvas}
            dispatch={dispatch}
            projectName={project.name}
            saveStatus={saveStatus}
          />
        ) : (
          <DartPreview code={code} project={project} />
        )}
      </EditorArea>
      {showInspector ? (
        <InspectorPanel>
          <CanvasInspector canvas={canvas} dispatch={dispatch} />
        </InspectorPanel>
      ) : null}
    </>
  );
}
