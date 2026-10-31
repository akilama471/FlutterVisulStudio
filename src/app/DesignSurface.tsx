import { useMemo, useReducer, useState } from "react";
import { EditorArea, type EditorTab } from "../features/editor/EditorArea";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { CanvasInspector } from "../features/canvas/CanvasInspector";
import { CanvasWorkspace } from "../features/canvas/CanvasWorkspace";
import { canvasReducer, createInitialCanvasState } from "../features/canvas/model";
import { DartPreview } from "../features/dart/DartPreview";
import { generateDart } from "../features/dart/generateDart";
import type { ProjectInfo } from "../shared/lib/project";

const DESIGN_TABS: EditorTab[] = [
  { id: "canvas", label: "Canvas", icon: "grid" },
  { id: "dart", label: "Dart", icon: "code" },
];

type DesignView = "canvas" | "dart";

type DesignSurfaceProps = {
  project: ProjectInfo;
  showInspector: boolean;
};

export function DesignSurface({ project, showInspector }: DesignSurfaceProps) {
  const [canvas, dispatch] = useReducer(canvasReducer, undefined, createInitialCanvasState);
  const [view, setView] = useState<DesignView>("canvas");
  const code = useMemo(() => generateDart(canvas.root), [canvas.root]);

  function selectView(id: string) {
    setView(id === "dart" ? "dart" : "canvas");
  }

  return (
    <>
      <EditorArea tabs={DESIGN_TABS} activeTabId={view} onSelectTab={selectView}>
        {view === "canvas" ? (
          <CanvasWorkspace canvas={canvas} dispatch={dispatch} projectName={project.name} />
        ) : (
          <DartPreview code={code} />
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
