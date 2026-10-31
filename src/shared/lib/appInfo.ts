import { invoke } from "@tauri-apps/api/core";

export type AppInfo = {
  name: string;
  version: string;
  tauriVersion: string;
};

export const FALLBACK_APP_INFO: AppInfo = Object.freeze({
  name: "Flutter UI Studio",
  version: "0.1.0",
  tauriVersion: "unavailable",
});

function isAppInfo(value: unknown): value is AppInfo {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.tauriVersion === "string"
  );
}

/**
 * Reads the product metadata from the Rust side. When the UI runs in a plain
 * browser (for example during component tests) the static fallback is used.
 */
export async function getAppInfo(): Promise<AppInfo> {
  try {
    const info: unknown = await invoke("app_info");
    return isAppInfo(info) ? info : FALLBACK_APP_INFO;
  } catch {
    return FALLBACK_APP_INFO;
  }
}
