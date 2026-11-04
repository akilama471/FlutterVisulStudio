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

export type ProjectWriteResult = {
  relativePath: string;
  backupPath: string | null;
  bytes: number;
};

export type ProjectTextFile = {
  relativePath: string;
  contents: string;
  bytes: number;
  modifiedMs: number;
};

export type ProjectTextFileStat = {
  relativePath: string;
  bytes: number;
  modifiedMs: number;
};

export type ProjectTextWriteResult = {
  relativePath: string;
  backupPath: string | null;
  bytes: number;
  modifiedMs: number;
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

function isProjectWriteResult(value: unknown): value is ProjectWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.relativePath === "string" &&
    value.relativePath.length > 0 &&
    (value.backupPath === null || typeof value.backupPath === "string") &&
    typeof value.bytes === "number" &&
    Number.isInteger(value.bytes) &&
    value.bytes >= 0
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isProjectTextFile(value: unknown): value is ProjectTextFile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.relativePath === "string" &&
    value.relativePath.length > 0 &&
    typeof value.contents === "string" &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

function isProjectTextFileStat(value: unknown): value is ProjectTextFileStat {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.relativePath === "string" &&
    value.relativePath.length > 0 &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

function isProjectTextWriteResult(value: unknown): value is ProjectTextWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.relativePath === "string" &&
    value.relativePath.length > 0 &&
    (value.backupPath === null || typeof value.backupPath === "string") &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

export function projectErrorMessage(
  error: unknown,
  fallback = "The project could not be opened.",
): string {
  if (error instanceof ProjectError) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return fallback;
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

export async function readProjectFile(relativePath: string): Promise<string | null> {
  try {
    const result: unknown = await invoke("read_project_file", { relativePath });

    if (result === null) {
      return null;
    }

    if (typeof result !== "string") {
      throw new ProjectError("The project file could not be read.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error, "The project file could not be read."));
  }
}

export async function writeProjectFile(
  relativePath: string,
  contents: string,
): Promise<ProjectWriteResult> {
  try {
    const result: unknown = await invoke("write_project_file", { relativePath, contents });

    if (!isProjectWriteResult(result)) {
      throw new ProjectError("The project file could not be written.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error, "The project file could not be written."));
  }
}

export async function readProjectTextFile(relativePath: string): Promise<ProjectTextFile> {
  try {
    const result: unknown = await invoke("read_project_text_file", { relativePath });

    if (!isProjectTextFile(result)) {
      throw new ProjectError("The file could not be read.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error, "The file could not be read."));
  }
}

export async function statProjectTextFile(relativePath: string): Promise<ProjectTextFileStat> {
  try {
    const result: unknown = await invoke("stat_project_text_file", { relativePath });

    if (!isProjectTextFileStat(result)) {
      throw new ProjectError("The file could not be inspected.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error, "The file could not be inspected."));
  }
}

export async function writeProjectTextFile(
  relativePath: string,
  contents: string,
  expectedModifiedMs: number | null,
): Promise<ProjectTextWriteResult> {
  try {
    const result: unknown = await invoke("write_project_text_file", {
      relativePath,
      contents,
      expectedModifiedMs,
    });

    if (!isProjectTextWriteResult(result)) {
      throw new ProjectError("The file could not be written.");
    }

    return result;
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }

    throw new ProjectError(projectErrorMessage(error, "The file could not be written."));
  }
}
