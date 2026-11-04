import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

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

const RECENT_PROJECT_KEY = "flutter-ui-studio:recent-project";
const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};
const ROOT_ENTRIES = [
  { name: "lib", relativePath: "lib", kind: "directory", hasChildren: true },
  { name: "pubspec.yaml", relativePath: "pubspec.yaml", kind: "file", hasChildren: false },
];
const LIB_ENTRIES = [
  { name: "main.dart", relativePath: "lib/main.dart", kind: "file", hasChildren: false },
];

function mockOpenProjectInvoke() {
  invokeMock.mockImplementation((command: string, args?: { relativePath?: string }) => {
    if (command === "open_project") {
      return Promise.resolve(PROJECT);
    }
    if (command === "list_project_directory") {
      return Promise.resolve(args?.relativePath === "lib" ? LIB_ENTRIES : ROOT_ENTRIES);
    }
    return Promise.reject(new Error("Tauri runtime unavailable"));
  });
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    openMock.mockReset();
    openMock.mockResolvedValue(null);
    invokeMock.mockReset();
    invokeMock.mockRejectedValue(new Error("Tauri runtime unavailable"));
  });

  it("renders the workbench shell", async () => {
    render(<App />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Activity bar" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Editor" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Flutter UI Studio" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: "Status bar" })).toBeInTheDocument();
    expect(screen.getByText("Phase 9")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Inspector" })).getByText("No project open"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Welcome" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Dart" })).not.toBeInTheDocument();

    expect(await screen.findByText("Tauri unavailable")).toBeInTheDocument();
  });

  it("toggles the explorer and inspector panels", async () => {
    const user = userEvent.setup();
    render(<App />);

    const explorerToggle = screen.getByRole("button", { name: "Toggle Explorer" });
    const inspectorToggle = screen.getByRole("button", { name: "Toggle Inspector" });

    expect(explorerToggle).toHaveAttribute("aria-pressed", "true");
    expect(inspectorToggle).toHaveAttribute("aria-pressed", "true");

    await user.click(explorerToggle);
    expect(screen.queryByRole("complementary", { name: "Explorer" })).not.toBeInTheDocument();
    expect(explorerToggle).toHaveAttribute("aria-pressed", "false");

    await user.click(inspectorToggle);
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();
    expect(inspectorToggle).toHaveAttribute("aria-pressed", "false");

    await user.click(explorerToggle);
    expect(screen.getByRole("complementary", { name: "Explorer" })).toBeInTheDocument();
  });

  it("shows the metadata reported by the Tauri command", async () => {
    invokeMock.mockResolvedValue({
      name: "Flutter UI Studio",
      version: "1.2.3",
      tauriVersion: "2.12.4",
    });

    render(<App />);

    expect(await screen.findByText("Tauri 2.12.4")).toBeInTheDocument();
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("app_info");
  });

  it("falls back to static metadata when the Tauri runtime is unavailable", async () => {
    render(<App />);

    expect(await screen.findByText("Tauri unavailable")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  it("ignores malformed metadata returned by the Tauri command", async () => {
    invokeMock.mockResolvedValue({
      name: "Flutter UI Studio",
      version: 42,
      tauriVersion: null,
    });

    render(<App />);

    expect(await screen.findByText("Tauri unavailable")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  it("opens a Flutter project and renders its file tree", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue(PROJECT.path);
    mockOpenProjectInvoke();

    render(<App />);

    const explorer = screen.getByRole("complementary", { name: "Explorer" });
    await user.click(within(explorer).getByRole("button", { name: "Open Flutter project" }));

    expect(await screen.findByRole("region", { name: "Visual canvas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Canvas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Dart" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: 'Text "Hello, Flutter!"' })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "lib" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pubspec.yaml" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("contentinfo", { name: "Status bar" })).getByText(PROJECT.name),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(RECENT_PROJECT_KEY)).toBe(PROJECT.path);
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false }),
    );
  });

  it("does nothing when the folder picker is cancelled", async () => {
    const user = userEvent.setup();
    render(<App />);

    const explorer = screen.getByRole("complementary", { name: "Explorer" });
    await user.click(within(explorer).getByRole("button", { name: "Open Flutter project" }));

    await waitFor(() => expect(openMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalledWith("open_project", expect.anything());
    expect(within(explorer).getByText("No project open")).toBeInTheDocument();
  });

  it("shows an error when the selected folder is not a Flutter project", async () => {
    const user = userEvent.setup();
    const errorMessage = "That folder is not a Flutter project (pubspec.yaml was not found).";
    openMock.mockResolvedValue("C:\\Projects\\not-flutter");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_project") {
        return Promise.reject(errorMessage);
      }
      return Promise.reject(new Error("Tauri runtime unavailable"));
    });

    render(<App />);

    const explorer = screen.getByRole("complementary", { name: "Explorer" });
    await user.click(within(explorer).getByRole("button", { name: "Open Flutter project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);
    expect(
      screen.getByRole("heading", { level: 1, name: "Flutter UI Studio" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(RECENT_PROJECT_KEY)).toBeNull();
  });

  it("expands folders lazily and loads their children", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RECENT_PROJECT_KEY, PROJECT.path);
    mockOpenProjectInvoke();

    render(<App />);

    const libEntry = await screen.findByRole("button", { name: "lib" });
    expect(libEntry).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "main.dart" })).not.toBeInTheDocument();

    await user.click(libEntry);

    expect(await screen.findByRole("button", { name: "main.dart" })).toBeInTheDocument();
    expect(libEntry).toHaveAttribute("aria-expanded", "true");
    expect(invokeMock).toHaveBeenCalledWith("list_project_directory", { relativePath: "lib" });
  });

  it("restores the remembered project on startup", async () => {
    window.localStorage.setItem(RECENT_PROJECT_KEY, PROJECT.path);
    mockOpenProjectInvoke();

    render(<App />);

    expect(await screen.findByRole("region", { name: "Visual canvas" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: 'Button "Get started"' })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("open_project", { path: PROJECT.path });
    expect(window.localStorage.getItem(RECENT_PROJECT_KEY)).toBe(PROJECT.path);
  });

  it("opens, edits, and saves a project file in a tab", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue(PROJECT.path);
    const contents = "# Demo App\n";
    invokeMock.mockImplementation(
      (command: string, args?: { relativePath?: string; contents?: string }) => {
        if (command === "open_project") {
          return Promise.resolve(PROJECT);
        }
        if (command === "list_project_directory") {
          return Promise.resolve(args?.relativePath === "lib" ? LIB_ENTRIES : ROOT_ENTRIES);
        }
        if (command === "read_project_text_file" || command === "stat_project_text_file") {
          return Promise.resolve({
            relativePath: args?.relativePath,
            contents,
            bytes: contents.length,
            modifiedMs: 100,
          });
        }
        if (command === "write_project_text_file") {
          return Promise.resolve({
            relativePath: args?.relativePath,
            backupPath: "pubspec.yaml.bak",
            bytes: args?.contents?.length ?? 0,
            modifiedMs: 200,
          });
        }
        return Promise.reject(new Error("Tauri runtime unavailable"));
      },
    );

    render(<App />);

    const explorer = screen.getByRole("complementary", { name: "Explorer" });
    await user.click(within(explorer).getByRole("button", { name: "Open Flutter project" }));

    await user.click(await screen.findByRole("button", { name: "pubspec.yaml" }));

    expect(await screen.findByRole("tab", { name: "pubspec.yaml" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const editor = await screen.findByLabelText("Edit pubspec.yaml");
    expect(editor).toHaveValue(contents);

    await user.type(editor, "Updated");
    const fileEditor = screen.getByRole("region", { name: "Editor for pubspec.yaml" });
    expect(within(fileEditor).getByText("Modified")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_project_text_file", {
        relativePath: "pubspec.yaml",
        contents: `${contents}Updated`,
        expectedModifiedMs: 100,
      });
    });
    expect(await within(fileEditor).findByText("Saved")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Inspector" })).getByRole("heading", {
        name: "pubspec.yaml",
      }),
    ).toBeInTheDocument();
  });

  it("clears a stale remembered project", async () => {
    window.localStorage.setItem(RECENT_PROJECT_KEY, "C:\\Projects\\deleted");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_project") {
        return Promise.reject("The project folder could not be opened.");
      }
      return Promise.reject(new Error("Tauri runtime unavailable"));
    });

    render(<App />);

    await waitFor(() => expect(window.localStorage.getItem(RECENT_PROJECT_KEY)).toBeNull());
    const explorer = screen.getByRole("complementary", { name: "Explorer" });
    expect(within(explorer).getByText("No project open")).toBeInTheDocument();
  });
});
