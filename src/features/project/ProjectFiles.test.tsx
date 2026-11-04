import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFiles } from "./ProjectFiles";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};

const ROOT_ENTRIES = [
  { name: "lib", relativePath: "lib", kind: "directory", hasChildren: true },
  { name: "README.md", relativePath: "README.md", kind: "file", hasChildren: false },
];

const LIB_ENTRIES = [
  { name: "main.dart", relativePath: "lib/main.dart", kind: "file", hasChildren: false },
];

type DirectoryMap = Record<string, typeof ROOT_ENTRIES>;

function mockDirectories(directories: DirectoryMap) {
  invokeMock.mockImplementation((command: string, args?: { relativePath?: string }) => {
    if (command !== "list_project_directory") {
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    }

    const relativePath = args?.relativePath ?? "";

    return Promise.resolve(directories[relativePath] ?? []);
  });
}

function renderFiles(refreshToken = 0, onOpenFile = vi.fn()) {
  const view = render(
    <ProjectFiles project={PROJECT} onOpenFile={onOpenFile} refreshToken={refreshToken} />,
  );

  return { ...view, onOpenFile };
}

describe("project files", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("lists the project root and opens a file tab on click", async () => {
    mockDirectories({ "": ROOT_ENTRIES });
    const user = userEvent.setup();
    const { onOpenFile } = renderFiles();

    const file = await screen.findByRole("button", { name: /README\.md/ });
    await user.click(file);

    expect(onOpenFile).toHaveBeenCalledWith("README.md");
    expect(file).toHaveAttribute("aria-selected", "true");
  });

  it("loads children when a folder is expanded", async () => {
    mockDirectories({ "": ROOT_ENTRIES, lib: LIB_ENTRIES });
    const user = userEvent.setup();
    renderFiles();

    const folder = await screen.findByRole("button", { name: /^lib$/ });
    await user.click(folder);

    expect(await screen.findByRole("button", { name: /main\.dart/ })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_project_directory", { relativePath: "lib" });
    expect(folder).toHaveAttribute("aria-expanded", "true");
  });

  it("re-lists the root and expanded folders when the refresh token changes", async () => {
    mockDirectories({ "": ROOT_ENTRIES, lib: LIB_ENTRIES });
    const user = userEvent.setup();
    const { rerender, onOpenFile } = renderFiles();

    await user.click(await screen.findByRole("button", { name: /^lib$/ }));
    await screen.findByRole("button", { name: /main\.dart/ });
    invokeMock.mockClear();

    mockDirectories({
      "": [
        ...ROOT_ENTRIES,
        { name: "notes.md", relativePath: "notes.md", kind: "file", hasChildren: false },
      ],
      lib: LIB_ENTRIES,
    });

    rerender(<ProjectFiles project={PROJECT} onOpenFile={onOpenFile} refreshToken={1} />);

    expect(await screen.findByRole("button", { name: /notes\.md/ })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_project_directory", { relativePath: "" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_project_directory", { relativePath: "lib" });
    });
    expect(screen.getByRole("button", { name: /main\.dart/ })).toBeInTheDocument();
  });

  it("shows a tree error when the root cannot be listed", async () => {
    invokeMock.mockRejectedValue("The project folder could not be opened.");

    renderFiles();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The project folder could not be opened.",
    );
  });
});
