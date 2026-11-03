import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApplyDartDialog } from "./ApplyDartDialog";

const CURRENT = "void main() {}\n";
const CODE = "void main() {\n  runApp();\n}\n";

function renderDialog(overrides: Partial<Parameters<typeof ApplyDartDialog>[0]> = {}) {
  const props = {
    target: "lib/main.dart",
    existing: CURRENT,
    code: CODE,
    writing: false,
    error: null,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };

  render(<ApplyDartDialog {...props} />);
  return props;
}

describe("ApplyDartDialog", () => {
  it("shows the target, diff, and backup rule", () => {
    const props = renderDialog();

    expect(screen.getByRole("dialog", { name: "Apply generated Dart" })).toBeInTheDocument();
    expect(screen.getByText("lib/main.dart")).toBeInTheDocument();
    expect(screen.getByText(/will be overwritten/)).toHaveTextContent(/backed up first/);
    expect(screen.getByText("+3 added")).toBeInTheDocument();
    expect(screen.getByText("−1 removed")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Write to project" })).toBeEnabled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("reports a new file instead of a backup", () => {
    renderDialog({ existing: null });

    expect(screen.getByText(/will be created/)).toBeInTheDocument();
    expect(screen.getByText("New file")).toBeInTheDocument();
    expect(screen.getByText("+3 added")).toBeInTheDocument();
    expect(screen.getByText("−0 removed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create file" })).toBeInTheDocument();
  });

  it("confirms and cancels through its actions", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole("button", { name: "Write to project" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels with Escape and shows errors", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ error: "The project file could not be written." });

    expect(screen.getByRole("alert")).toHaveTextContent("could not be written");

    await user.keyboard("{Escape}");
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables actions and ignores Escape while writing", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ writing: true });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Writing…" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});
