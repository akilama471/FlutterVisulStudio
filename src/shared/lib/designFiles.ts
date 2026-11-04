import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export type DesignFileReadResult = {
  path: string;
  contents: string;
  bytes: number;
  modifiedMs: number;
};

export type DesignFileWriteResult = {
  path: string;
  backupPath: string | null;
  bytes: number;
  modifiedMs: number;
};

export type ProjectDesignReadResult = {
  relativePath: string;
  contents: string;
  bytes: number;
  modifiedMs: number;
};

export type ProjectDesignWriteResult = {
  relativePath: string;
  backupPath: string | null;
  bytes: number;
  modifiedMs: number;
};

export class DesignFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignFileError";
  }
}

export async function chooseDesignExportPath(defaultName: string): Promise<string | null> {
  try {
    const selection = await save({
      title: "Export design",
      defaultPath: defaultName,
      filters: [{ name: "Flutter UI Studio design", extensions: ["json"] }],
    });

    if (typeof selection !== "string" || selection.length === 0) {
      return null;
    }

    return selection.toLowerCase().endsWith(".json") ? selection : `${selection}.json`;
  } catch {
    throw new DesignFileError("The save dialog could not be opened.");
  }
}

export async function chooseDesignImportPath(): Promise<string | null> {
  try {
    const selection = await open({
      title: "Import design",
      multiple: false,
      directory: false,
      filters: [{ name: "Flutter UI Studio design", extensions: ["json"] }],
    });

    return typeof selection === "string" ? selection : null;
  } catch {
    throw new DesignFileError("The file picker could not be opened.");
  }
}

export async function writeDesignExportFile(
  path: string,
  contents: string,
  expectedModifiedMs: number | null,
): Promise<DesignFileWriteResult> {
  try {
    const result: unknown = await invoke("write_design_export_file", {
      path,
      contents,
      expectedModifiedMs,
    });

    if (!isDesignFileWriteResult(result)) {
      throw new DesignFileError("The design file could not be written.");
    }

    return result;
  } catch (error) {
    if (error instanceof DesignFileError) {
      throw error;
    }

    throw new DesignFileError(
      designFileErrorMessage(error, "The design file could not be written."),
    );
  }
}

export async function readDesignImportFile(path: string): Promise<DesignFileReadResult> {
  try {
    const result: unknown = await invoke("read_design_import_file", { path });

    if (!isDesignFileReadResult(result)) {
      throw new DesignFileError("The design file could not be read.");
    }

    return result;
  } catch (error) {
    if (error instanceof DesignFileError) {
      throw error;
    }

    throw new DesignFileError(designFileErrorMessage(error, "The design file could not be read."));
  }
}

export async function readProjectDesignFile(): Promise<ProjectDesignReadResult> {
  try {
    const result: unknown = await invoke("read_project_design_file");

    if (!isProjectDesignReadResult(result)) {
      throw new DesignFileError("The project design file could not be read.");
    }

    return result;
  } catch (error) {
    if (error instanceof DesignFileError) {
      throw error;
    }

    throw new DesignFileError(
      designFileErrorMessage(error, "The project design file could not be read."),
    );
  }
}

export async function writeProjectDesignFile(contents: string): Promise<ProjectDesignWriteResult> {
  try {
    const result: unknown = await invoke("write_project_design_file", { contents });

    if (!isProjectDesignWriteResult(result)) {
      throw new DesignFileError("The project design file could not be written.");
    }

    return result;
  } catch (error) {
    if (error instanceof DesignFileError) {
      throw error;
    }

    throw new DesignFileError(
      designFileErrorMessage(error, "The project design file could not be written."),
    );
  }
}

export function designFileErrorMessage(
  error: unknown,
  fallback = "The design file could not be used.",
): string {
  if (error instanceof DesignFileError) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return fallback;
}

function isDesignFileReadResult(value: unknown): value is DesignFileReadResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.path) &&
    typeof value.contents === "string" &&
    value.contents.length > 0 &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

function isDesignFileWriteResult(value: unknown): value is DesignFileWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.path) &&
    (value.backupPath === null || typeof value.backupPath === "string") &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

function isProjectDesignReadResult(value: unknown): value is ProjectDesignReadResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.relativePath) &&
    typeof value.contents === "string" &&
    value.contents.length > 0 &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

function isProjectDesignWriteResult(value: unknown): value is ProjectDesignWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.relativePath) &&
    (value.backupPath === null || typeof value.backupPath === "string") &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.modifiedMs)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
