const RECENT_PROJECT_KEY = "flutter-ui-studio:recent-project";

export function readRecentProject(): string | null {
  try {
    return window.localStorage.getItem(RECENT_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function rememberProject(path: string): void {
  try {
    window.localStorage.setItem(RECENT_PROJECT_KEY, path);
  } catch {
    // Storage can be unavailable in hardened webviews; remembering is best effort.
  }
}

export function forgetProject(): void {
  try {
    window.localStorage.removeItem(RECENT_PROJECT_KEY);
  } catch {
    // Removing a best-effort value does not affect the open project.
  }
}
