import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjectDirectory, openProject, ProjectError } from "./project";

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
});
