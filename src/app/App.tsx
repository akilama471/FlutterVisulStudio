import { useEffect, useState } from "react";
import { ActivityBar } from "../features/editor/ActivityBar";
import { EditorArea } from "../features/editor/EditorArea";
import { EditorWelcome } from "../features/editor/EditorWelcome";
import { StatusBar } from "../features/editor/StatusBar";
import { WorkbenchHeader } from "../features/editor/WorkbenchHeader";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { NoProjectInspector } from "../features/canvas/CanvasInspector";
import { ProjectExplorer } from "../features/project/ProjectExplorer";
import { useProjectWorkspace, type ProjectStatus } from "../features/project/useProjectWorkspace";
import { DesignWorkspaceProvider } from "../features/canvas/DesignWorkspaceProvider";
import { CanvasUndoToast } from "../features/canvas/CanvasUndoToast";
import { FileWorkspaceProvider } from "../features/files/FileWorkspaceProvider";
import { useFileWorkspace } from "../features/files/fileWorkspaceContext";
import { FALLBACK_APP_INFO, getAppInfo, type AppInfo } from "../shared/lib/appInfo";
import type { ProjectInfo } from "../shared/lib/project";
import { DesignSurface } from "./DesignSurface";

type PanelVisibility = {
  explorer: boolean;
  inspector: boolean;
};

export function App() {
  const [panels, setPanels] = useState<PanelVisibility>({ explorer: true, inspector: true });
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);
  const { project, status, error, openProjectFromPicker } = useProjectWorkspace();

  useEffect(() => {
    let active = true;

    void getAppInfo().then((info) => {
      if (active) {
        setAppInfo(info);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  function togglePanel(panel: keyof PanelVisibility) {
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  return (
    <div className="app-shell">
      <WorkbenchHeader project={project} />
      <div className="workbench">
        <ActivityBar
          explorerOpen={panels.explorer}
          inspectorOpen={panels.inspector}
          onToggleExplorer={() => togglePanel("explorer")}
          onToggleInspector={() => togglePanel("inspector")}
        />
        {project ? (
          <DesignWorkspaceProvider key={project.path} project={project}>
            <FileWorkspaceProvider key={project.path}>
              <ProjectWorkspace
                project={project}
                status={status}
                error={error}
                showExplorer={panels.explorer}
                showInspector={panels.inspector}
                onOpenProject={openProjectFromPicker}
              />
            </FileWorkspaceProvider>
            <CanvasUndoToast />
          </DesignWorkspaceProvider>
        ) : (
          <>
            {panels.explorer ? (
              <ProjectExplorer
                project={null}
                status={status}
                error={error}
                onOpenProject={openProjectFromPicker}
              />
            ) : null}
            <EditorArea
              tabs={[{ id: "welcome", label: "Welcome", icon: "file" }]}
              activeTabId="welcome"
            >
              <EditorWelcome status={status} onOpenProject={openProjectFromPicker} />
            </EditorArea>
            {panels.inspector ? (
              <InspectorPanel>
                <NoProjectInspector />
              </InspectorPanel>
            ) : null}
          </>
        )}
      </div>
      <StatusBar appInfo={appInfo} project={project} status={status} />
    </div>
  );
}

type ProjectWorkspaceProps = {
  project: ProjectInfo;
  status: ProjectStatus;
  error: string | null;
  showExplorer: boolean;
  showInspector: boolean;
  onOpenProject: () => void;
};

function ProjectWorkspace({
  project,
  status,
  error,
  showExplorer,
  showInspector,
  onOpenProject,
}: ProjectWorkspaceProps) {
  const { openFile, refreshFiles, refreshToken } = useFileWorkspace();

  return (
    <>
      {showExplorer ? (
        <ProjectExplorer
          project={project}
          status={status}
          error={error}
          onOpenProject={onOpenProject}
          onOpenFile={openFile}
          onRefreshFiles={refreshFiles}
          refreshToken={refreshToken}
        />
      ) : null}
      <DesignSurface project={project} showInspector={showInspector} />
    </>
  );
}
