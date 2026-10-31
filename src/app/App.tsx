import { useEffect, useState } from "react";
import { ActivityBar } from "../features/editor/ActivityBar";
import { EditorArea } from "../features/editor/EditorArea";
import { EditorWelcome } from "../features/editor/EditorWelcome";
import { StatusBar } from "../features/editor/StatusBar";
import { WorkbenchHeader } from "../features/editor/WorkbenchHeader";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { NoProjectInspector } from "../features/canvas/CanvasInspector";
import { ProjectExplorer } from "../features/project/ProjectExplorer";
import { useProjectWorkspace } from "../features/project/useProjectWorkspace";
import { FALLBACK_APP_INFO, getAppInfo, type AppInfo } from "../shared/lib/appInfo";
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
        {panels.explorer ? (
          <ProjectExplorer
            project={project}
            status={status}
            error={error}
            onOpenProject={openProjectFromPicker}
          />
        ) : null}
        {project ? (
          <DesignSurface key={project.path} project={project} showInspector={panels.inspector} />
        ) : (
          <>
            <EditorArea tabLabel="Welcome" tabIcon="file">
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
