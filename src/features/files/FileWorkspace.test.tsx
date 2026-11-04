import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileEditor } from "./FileEditor";
import { FileWorkspaceProvider } from "./FileWorkspaceProvider";
import { useFileWorkspace } from "./fileWorkspaceContext";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

type MockFileOptions = {
  contents?: string;
  modifiedMs?: number;
  readError?: string;
  writeError?: string;
  writeModifiedMs?: number;
  backupPath?: string | null;
};

function mockFile({
  contents = "# Hello\n",
  modifiedMs = 100,
  readError,
  writeError,
  writeModifiedMs = 200,
  backupPath = "README.md.bak",
}: MockFileOptions = {}) {
  invokeMock.mockImplementation((command: string, args?: { relativePath?: string }) => {
    const relativePath = args?.relativePath ?? "README.md";

    if (command === "read_project_text_file") {
      if (readError) {
        return Promise.reject(readError);
      }

      return Promise.resolve({
        relativePath,
        contents,
        bytes: new TextEncoder().encode(contents).length,
        modifiedMs,
      });
    }

    if (command === "stat_project_text_file") {
      return Promise.resolve({
        relativePath,
        bytes: new TextEncoder().encode(contents).length,
        modifiedMs,
      });
    }

    if (command === "write_project_text_file") {
      if (writeError) {
        return Promise.reject(writeError);
      }

      return Promise.resolve({
        relativePath,
        backupPath,
        bytes: 8,
        modifiedMs: writeModifiedMs,
      });
    }

    return Promise.reject(new Error(`Unexpected command: ${command}`));
  });
}

function Harness({ path = "README.md" }: { path?: string }) {
  const { activeFile, openFile } = useFileWorkspace();

  useEffect(() => {
    openFile(path);
  }, [openFile, path]);

  return activeFile ? <FileEditor file={activeFile} /> : <p>No active file</p>;
}

function renderHarness(path = "README.md") {
  return render(
    <FileWorkspaceProvider>
      <Harness path={path} />
    </FileWorkspaceProvider>,
  );
}

describe("file workspace", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("opens a text file and shows its contents, size, and line count", async () => {
    mockFile();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    expect(editor).toHaveValue("# Hello\n");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("2 lines")).toBeInTheDocument();
    expect(screen.getByText("8 bytes")).toBeInTheDocument();
    expect(screen.getByText("1", { selector: ".file-editor__gutter span" })).toBeInTheDocument();
    expect(screen.getByText("2", { selector: ".file-editor__gutter span" })).toBeInTheDocument();
  });

  it("tracks edits and saves with the loaded modified time", async () => {
    mockFile();
    const user = userEvent.setup();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    await user.type(editor, "Updated");
    expect(screen.getByText("Modified")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_project_text_file", {
        relativePath: "README.md",
        contents: "# Hello\nUpdated",
        expectedModifiedMs: 100,
      });
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Backup README.md.bak")).toBeInTheDocument();
  });

  it("saves with Ctrl+S", async () => {
    mockFile();
    const user = userEvent.setup();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    await user.type(editor, "!");
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "write_project_text_file",
        expect.objectContaining({ expectedModifiedMs: 100 }),
      );
    });
  });

  it("confirms before closing a dirty tab", async () => {
    mockFile();
    const user = userEvent.setup();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    await user.type(editor, "changed");
    await user.click(screen.getByRole("button", { name: "Close file README.md" }));

    expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit README.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close file README.md" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.queryByLabelText("Edit README.md")).not.toBeInTheDocument();
    expect(screen.getByText("No active file")).toBeInTheDocument();
  });

  it("asks for the dirty file to be closed when Escape is pressed", async () => {
    mockFile();
    const user = userEvent.setup();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    await user.type(editor, "changed");
    await user.click(screen.getByRole("button", { name: "Close file README.md" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit README.md")).toBeInTheDocument();
  });

  it("reloads a clean file when it changes on disk", async () => {
    mockFile();
    renderHarness();
    await screen.findByLabelText("Edit README.md");

    mockFile({ contents: "remote\n", modifiedMs: 300 });
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(screen.getByLabelText("Edit README.md")).toHaveValue("remote\n");
    });
    expect(screen.queryByText("File changed on disk.")).not.toBeInTheDocument();
  });

  it("warns before replacing local edits with an external change", async () => {
    mockFile();
    const user = userEvent.setup();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    await user.type(editor, " local");
    mockFile({ contents: "remote\n", modifiedMs: 300 });
    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText("File changed on disk.")).toBeInTheDocument();
    expect(editor).toHaveValue("# Hello\n local");

    const banner = screen.getByRole("alert");
    await user.click(within(banner).getByRole("button", { name: "Reload" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Edit README.md")).toHaveValue("remote\n");
    });
    expect(screen.queryByText("File changed on disk.")).not.toBeInTheDocument();
  });

  it("offers an explicit overwrite after a save conflict", async () => {
    mockFile({ writeError: "The file changed on disk. Reload it before saving." });
    const user = userEvent.setup();
    renderHarness();

    const editor = await screen.findByLabelText("Edit README.md");
    await user.type(editor, " local");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("File changed on disk.")).toBeInTheDocument();
    expect(editor).toHaveValue("# Hello\n local");
    expect(screen.getByText("Reload the file or overwrite it with your local text.")).toBeVisible();
  });

  it("retries a failed read", async () => {
    mockFile({ readError: "Only UTF-8 text files can be opened." });
    const user = userEvent.setup();
    renderHarness();

    expect(await screen.findByText("Only UTF-8 text files can be opened.")).toBeInTheDocument();

    mockFile({ contents: "recovered\n" });
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Edit README.md")).toHaveValue("recovered\n");
    });
  });
});
