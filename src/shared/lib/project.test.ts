import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listProjectDirectory,
  openProject,
  ProjectError,
  readProjectFile,
  writeProjectFile,
} from "./project";

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
}));

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

describe("project service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
  });

  it("opens a project through the Tauri command", async () => {
    invokeMock.mockResolvedValue(PROJECT);

    await expect(openProject(PROJECT.path)).resolves.toEqual(PROJECT);
    expect(invokeMock).toHaveBeenCalledWith("open_project", { path: PROJECT.path });
  });

  it("rejects malformed project metadata", async () => {
    invokeMock.mockResolvedValue({ name: "demo_app", path: 42 });

    await expect(openProject(PROJECT.path)).rejects.toThrow("invalid response");
  });

  it("surfaces Rust command errors", async () => {
    invokeMock.mockRejectedValue("That folder is not a Flutter project.");

    await expect(openProject(PROJECT.path)).rejects.toThrow(
      "That folder is not a Flutter project.",
    );
  });

  it("lists and validates directory entries", async () => {
    const entries = [
      { name: "lib", relativePath: "lib", kind: "directory", hasChildren: true },
      { name: "pubspec.yaml", relativePath: "pubspec.yaml", kind: "file", hasChildren: false },
    ];
    invokeMock.mockResolvedValue(entries);

    await expect(listProjectDirectory("")).resolves.toEqual(entries);
    expect(invokeMock).toHaveBeenCalledWith("list_project_directory", { relativePath: "" });
  });

  it("rejects malformed directory entries", async () => {
    invokeMock.mockResolvedValue([{ name: "lib", kind: "unknown" }]);

    await expect(listProjectDirectory("")).rejects.toBeInstanceOf(ProjectError);
  });

  it("reads a project file through the Tauri command", async () => {
    invokeMock.mockResolvedValue("void main() {}\n");

    await expect(readProjectFile("lib/main.dart")).resolves.toBe("void main() {}\n");
    expect(invokeMock).toHaveBeenCalledWith("read_project_file", { relativePath: "lib/main.dart" });
  });

  it("reports a missing project file as null", async () => {
    invokeMock.mockResolvedValue(null);

    await expect(readProjectFile("lib/main.dart")).resolves.toBeNull();
  });

  it("rejects malformed project file contents", async () => {
    invokeMock.mockResolvedValue(42);

    await expect(readProjectFile("lib/main.dart")).rejects.toThrow(
      "The project file could not be read.",
    );
  });

  it("writes a project file and validates the result", async () => {
    const result = {
      relativePath: "lib/main.dart",
      backupPath: "lib/main.dart.bak",
      bytes: 15,
    };
    invokeMock.mockResolvedValue(result);

    await expect(writeProjectFile("lib/main.dart", "void studio() {}\n")).resolves.toEqual(result);
    expect(invokeMock).toHaveBeenCalledWith("write_project_file", {
      relativePath: "lib/main.dart",
      contents: "void studio() {}\n",
    });
  });

  it("rejects malformed write results", async () => {
    invokeMock.mockResolvedValue({ relativePath: "lib/main.dart", bytes: -1 });

    await expect(writeProjectFile("lib/main.dart", "code")).rejects.toBeInstanceOf(ProjectError);
  });

  it("surfaces write failures with a file-specific fallback", async () => {
    invokeMock.mockRejectedValue(new Error("unexpected"));

    await expect(writeProjectFile("lib/main.dart", "code")).rejects.toThrow(
      "The project file could not be written.",
    );
  });
});
