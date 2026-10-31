import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type ProjectInfo = {
  name: string;
  path: string;
  entryPoint: string | null;
};

export type ProjectEntryKind = "directory" | "file";

export type ProjectEntry = {
  name: string;
  relativePath: string;
  kind: ProjectEntryKind;
  hasChildren: boolean;
};

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProjectInfo(value: unknown): value is ProjectInfo {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    (value.entryPoint === null || typeof value.entryPoint === "string")
  );
}

function isProjectEntry(value: unknown): value is ProjectEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.relativePath === "string" &&
    value.relativePath.length > 0 &&
    (value.kind === "directory" || value.kind === "file") &&
    typeof value.hasChildren === "boolean"
  );
}

export function projectErrorMessage(error: unknown): string {
  if (error instanceof ProjectError) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return "The project could not be opened.";
}

export async function selectProjectFolder(): Promise<string | null> {
  try {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Open Flutter project",
    });

    return typeof selection === "string" ? selection : null;
  } catch {
    throw new ProjectError("The folder picker could not be opened.");
  }
}

export async function openProject(path: string): Promise<ProjectInfo> {
  try {
    const result: unknown = await invoke("open_project", { path });

    if (!isProjectInfo(result)) {
      throw new ProjectError("The project returned an invalid response.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error));
  }
}

export async function listProjectDirectory(relativePath: string): Promise<ProjectEntry[]> {
  try {
    const result: unknown = await invoke("list_project_directory", { relativePath });

    if (!Array.isArray(result) || !result.every(isProjectEntry)) {
      throw new ProjectError("The project files could not be read.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error));
  }
}
