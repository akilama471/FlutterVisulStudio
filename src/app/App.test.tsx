import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("App", () => {
  beforeEach(() => {
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

    expect(await screen.findByText("Tauri unavailable")).toBeInTheDocument();
  });

  it("toggles the explorer and inspector panels", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Toggle Explorer" }));
    expect(screen.queryByRole("complementary", { name: "Explorer" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle Inspector" }));
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle Explorer" }));
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
});
