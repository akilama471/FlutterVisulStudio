import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listProjectDirectory,
  openProject,
  ProjectError,
  readProjectFile,
  readProjectTextFile,
  statProjectTextFile,
  writeProjectFile,
  writeProjectTextFile,
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

  it("reads a general project text file", async () => {
    const result = {
      relativePath: "pubspec.yaml",
      contents: "name: demo_app\n",
      bytes: 15,
      modifiedMs: 1_700_000_000_000,
    };
    invokeMock.mockResolvedValue(result);

    await expect(readProjectTextFile("pubspec.yaml")).resolves.toEqual(result);
    expect(invokeMock).toHaveBeenCalledWith("read_project_text_file", {
      relativePath: "pubspec.yaml",
    });
  });

  it("rejects malformed text file contents", async () => {
    invokeMock.mockResolvedValue({ relativePath: "README.md", contents: 42 });

    await expect(readProjectTextFile("README.md")).rejects.toThrow("The file could not be read.");
  });

  it("stats a general project text file", async () => {
    const result = { relativePath: "README.md", bytes: 10, modifiedMs: 5 };
    invokeMock.mockResolvedValue(result);

    await expect(statProjectTextFile("README.md")).resolves.toEqual(result);
    expect(invokeMock).toHaveBeenCalledWith("stat_project_text_file", {
      relativePath: "README.md",
    });
  });

  it("writes a text file with its conflict baseline", async () => {
    const result = {
      relativePath: "README.md",
      backupPath: "README.md.bak",
      bytes: 8,
      modifiedMs: 6,
    };
    invokeMock.mockResolvedValue(result);

    await expect(writeProjectTextFile("README.md", "updated\n", 5)).resolves.toEqual(result);
    expect(invokeMock).toHaveBeenCalledWith("write_project_text_file", {
      relativePath: "README.md",
      contents: "updated\n",
      expectedModifiedMs: 5,
    });
  });

  it("supports an explicit overwrite without a baseline", async () => {
    invokeMock.mockResolvedValue({
      relativePath: "README.md",
      backupPath: "README.md.bak.1",
      bytes: 8,
      modifiedMs: 7,
    });

    await writeProjectTextFile("README.md", "updated\n", null);
    expect(invokeMock).toHaveBeenCalledWith("write_project_text_file", {
      relativePath: "README.md",
      contents: "updated\n",
      expectedModifiedMs: null,
    });
  });

  it("rejects malformed text write results", async () => {
    invokeMock.mockResolvedValue({ relativePath: "README.md", bytes: 8 });

    await expect(writeProjectTextFile("README.md", "updated\n", 5)).rejects.toBeInstanceOf(
      ProjectError,
    );
  });
});
