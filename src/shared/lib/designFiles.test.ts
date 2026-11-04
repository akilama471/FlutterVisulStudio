import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseDesignExportPath,
  chooseDesignImportPath,
  DesignFileError,
  designFileErrorMessage,
  readDesignImportFile,
  readProjectDesignFile,
  writeDesignExportFile,
  writeProjectDesignFile,
} from "./designFiles";

const { invokeMock, openMock, saveMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
  save: saveMock,
}));

const EXPORT_PATH = "C:\\Designs\\demo.json";
const READ_RESULT = {
  path: EXPORT_PATH,
  contents: '{"format":"flutter-ui-studio-design"}',
  bytes: 38,
  modifiedMs: 1_700_000_000_000,
};
const WRITE_RESULT = {
  path: EXPORT_PATH,
  backupPath: null,
  bytes: 38,
  modifiedMs: 1_700_000_000_001,
};

describe("design file service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
  });

  it("asks for an export path and appends the JSON extension", async () => {
    saveMock.mockResolvedValue("C:\\Designs\\demo");

    await expect(chooseDesignExportPath("demo-project.json")).resolves.toBe(
      "C:\\Designs\\demo.json",
    );
    expect(saveMock).toHaveBeenCalledWith({
      title: "Export design",
      defaultPath: "demo-project.json",
      filters: [{ name: "Flutter UI Studio design", extensions: ["json"] }],
    });
  });

  it("keeps an existing JSON extension and handles cancellation", async () => {
    saveMock.mockResolvedValueOnce("C:\\Designs\\demo.JSON");
    await expect(chooseDesignExportPath("demo.json")).resolves.toBe("C:\\Designs\\demo.JSON");

    saveMock.mockResolvedValueOnce(null);
    await expect(chooseDesignExportPath("demo.json")).resolves.toBeNull();
  });

  it("reports save dialog failures", async () => {
    saveMock.mockRejectedValue(new Error("dialog failed"));

    await expect(chooseDesignExportPath("demo.json")).rejects.toBeInstanceOf(DesignFileError);
  });

  it("asks for an import path", async () => {
    openMock.mockResolvedValue(EXPORT_PATH);

    await expect(chooseDesignImportPath()).resolves.toBe(EXPORT_PATH);
    expect(openMock).toHaveBeenCalledWith({
      title: "Import design",
      multiple: false,
      directory: false,
      filters: [{ name: "Flutter UI Studio design", extensions: ["json"] }],
    });

    openMock.mockResolvedValueOnce(null);
    await expect(chooseDesignImportPath()).resolves.toBeNull();
  });

  it("reads a chosen import file through Tauri", async () => {
    invokeMock.mockResolvedValue(READ_RESULT);

    await expect(readDesignImportFile(EXPORT_PATH)).resolves.toEqual(READ_RESULT);
    expect(invokeMock).toHaveBeenCalledWith("read_design_import_file", { path: EXPORT_PATH });
  });

  it("writes an export file through Tauri", async () => {
    invokeMock.mockResolvedValue(WRITE_RESULT);

    await expect(writeDesignExportFile(EXPORT_PATH, "{}", null)).resolves.toEqual(WRITE_RESULT);
    expect(invokeMock).toHaveBeenCalledWith("write_design_export_file", {
      path: EXPORT_PATH,
      contents: "{}",
      expectedModifiedMs: null,
    });
  });

  it("reads and writes the project design file", async () => {
    invokeMock.mockResolvedValueOnce({
      ...READ_RESULT,
      relativePath: ".flutter-ui-studio/design.json",
    });
    invokeMock.mockResolvedValueOnce({
      ...WRITE_RESULT,
      relativePath: ".flutter-ui-studio/design.json",
    });

    await expect(readProjectDesignFile()).resolves.toEqual({
      ...READ_RESULT,
      relativePath: ".flutter-ui-studio/design.json",
    });
    await expect(writeProjectDesignFile("{}")).resolves.toEqual({
      ...WRITE_RESULT,
      relativePath: ".flutter-ui-studio/design.json",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "read_project_design_file");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "write_project_design_file", {
      contents: "{}",
    });
  });

  it("rejects malformed command responses", async () => {
    invokeMock.mockResolvedValueOnce({ path: EXPORT_PATH, contents: 42 });
    await expect(readDesignImportFile(EXPORT_PATH)).rejects.toBeInstanceOf(DesignFileError);

    invokeMock.mockResolvedValueOnce({ path: 42 });
    await expect(writeDesignExportFile(EXPORT_PATH, "{}", null)).rejects.toBeInstanceOf(
      DesignFileError,
    );

    invokeMock.mockResolvedValueOnce({ relativePath: "" });
    await expect(readProjectDesignFile()).rejects.toBeInstanceOf(DesignFileError);

    invokeMock.mockResolvedValueOnce({ relativePath: ".flutter-ui-studio/design.json", bytes: -1 });
    await expect(writeProjectDesignFile("{}")).rejects.toBeInstanceOf(DesignFileError);
  });

  it("surfaces Rust errors and falls back for unknown errors", async () => {
    invokeMock.mockRejectedValueOnce("The design file is too large to read or write.");
    await expect(readDesignImportFile(EXPORT_PATH)).rejects.toThrow(
      "The design file is too large to read or write.",
    );

    invokeMock.mockRejectedValueOnce(new Error("unexpected"));
    await expect(readDesignImportFile(EXPORT_PATH)).rejects.toThrow(
      "The design file could not be read.",
    );
  });

  it("normalises error messages", () => {
    expect(designFileErrorMessage(new DesignFileError("Known"))).toBe("Known");
    expect(designFileErrorMessage("  Spaced  ")).toBe("Spaced");
    expect(designFileErrorMessage(new Error("hidden"), "Fallback")).toBe("Fallback");
  });
});
