import { useEffect, useState } from "react";
import { ActivityBar } from "../features/editor/ActivityBar";
import { EditorArea } from "../features/editor/EditorArea";
import { StatusBar } from "../features/editor/StatusBar";
import { WorkbenchHeader } from "../features/editor/WorkbenchHeader";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { ProjectExplorer } from "../features/project/ProjectExplorer";
import { FALLBACK_APP_INFO, getAppInfo, type AppInfo } from "../shared/lib/appInfo";

type PanelVisibility = {
  explorer: boolean;
  inspector: boolean;
};

export function App() {
  const [panels, setPanels] = useState<PanelVisibility>({ explorer: true, inspector: true });
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);

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
      <WorkbenchHeader />
      <div className="workbench">
        <ActivityBar
          explorerOpen={panels.explorer}
          inspectorOpen={panels.inspector}
          onToggleExplorer={() => togglePanel("explorer")}
          onToggleInspector={() => togglePanel("inspector")}
        />
        {panels.explorer ? <ProjectExplorer /> : null}
        <EditorArea />
        {panels.inspector ? <InspectorPanel /> : null}
      </div>
      <StatusBar appInfo={appInfo} />
    </div>
  );
}
