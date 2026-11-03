import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DartPreview } from "./DartPreview";

const { readMock, writeMock } = vi.hoisted(() => ({
  readMock: vi.fn(),
  writeMock: vi.fn(),
}));

vi.mock("../../shared/lib/project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/lib/project")>();
  return { ...actual, readProjectFile: readMock, writeProjectFile: writeMock };
});

const PROJECT = {
  name: "demo_app",
  path: "C:\\Projects\\demo_app",
  entryPoint: "lib/main.dart",
};
const CODE = "void main() {}\n";

describe("DartPreview apply flow", () => {
  beforeEach(() => {
    readMock.mockReset();
    writeMock.mockReset();
  });

  it("reads the entry point and opens the review dialog", async () => {
    const user = userEvent.setup();
    readMock.mockResolvedValue("// existing app\n");

    render(<DartPreview code={CODE} project={PROJECT} />);
    await user.click(screen.getByRole("button", { name: "Apply to project" }));

    const dialog = await screen.findByRole("dialog", { name: "Apply generated Dart" });
    expect(readMock).toHaveBeenCalledWith("lib/main.dart");
    expect(within(dialog).getByText("// existing app")).toBeInTheDocument();
    expect(within(dialog).getByText(/will be overwritten/)).toBeInTheDocument();
  });

  it("writes the generated code and reports the backup", async () => {
    const user = userEvent.setup();
    readMock.mockResolvedValue("// existing app\n");
    writeMock.mockResolvedValue({
      relativePath: "lib/main.dart",
      backupPath: "lib/main.dart.bak",
      bytes: 15,
    });

    render(<DartPreview code={CODE} project={PROJECT} />);
    await user.click(screen.getByRole("button", { name: "Apply to project" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Write to project" }));

    expect(await screen.findByText(/Written to lib\/main.dart/)).toHaveTextContent(
      "Backup lib/main.dart.bak",
    );
    expect(writeMock).toHaveBeenCalledWith("lib/main.dart", CODE);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers to create the entry point when it is missing", async () => {
    const user = userEvent.setup();
    readMock.mockResolvedValue(null);

    render(<DartPreview code={CODE} project={{ ...PROJECT, entryPoint: null }} />);
    await user.click(screen.getByRole("button", { name: "Apply to project" }));

    const dialog = await screen.findByRole("dialog");
    expect(readMock).toHaveBeenCalledWith("lib/main.dart");
    expect(within(dialog).getByText(/will be created/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create file" })).toBeInTheDocument();
  });

  it("reports a read failure without opening the dialog", async () => {
    const user = userEvent.setup();
    readMock.mockRejectedValue("The project file could not be read.");

    render(<DartPreview code={CODE} project={PROJECT} />);
    await user.click(screen.getByRole("button", { name: "Apply to project" }));

    expect(await screen.findByText("The project file could not be read.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open when the write fails", async () => {
    const user = userEvent.setup();
    readMock.mockResolvedValue("// existing app\n");
    writeMock.mockRejectedValue("The project file could not be written.");

    render(<DartPreview code={CODE} project={PROJECT} />);
    await user.click(screen.getByRole("button", { name: "Apply to project" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Write to project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be written");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write to project" })).toBeEnabled();
  });
});
