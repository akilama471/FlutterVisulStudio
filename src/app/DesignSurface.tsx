import { useReducer } from "react";
import { EditorArea } from "../features/editor/EditorArea";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { CanvasInspector } from "../features/canvas/CanvasInspector";
import { CanvasWorkspace } from "../features/canvas/CanvasWorkspace";
import { canvasReducer, createInitialCanvasState } from "../features/canvas/model";
import type { ProjectInfo } from "../shared/lib/project";

type DesignSurfaceProps = {
  project: ProjectInfo;
  showInspector: boolean;
};

export function DesignSurface({ project, showInspector }: DesignSurfaceProps) {
  const [canvas, dispatch] = useReducer(canvasReducer, undefined, createInitialCanvasState);

  return (
    <>
      <EditorArea tabLabel={project.name} tabIcon="grid">
        <CanvasWorkspace canvas={canvas} dispatch={dispatch} projectName={project.name} />
      </EditorArea>
      {showInspector ? (
        <InspectorPanel>
          <CanvasInspector canvas={canvas} dispatch={dispatch} />
        </InspectorPanel>
      ) : null}
    </>
  );
}
