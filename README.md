# 🎨 Flutter UI Studio

**A lightweight visual desktop studio for designing Flutter user
interfaces.**

Flutter UI Studio helps you create and organize Flutter UI layouts
visually. Build screens with drag-and-drop widgets, edit their
properties, manage multiple canvases, and preview the generated Dart
code --- all from a desktop application.

> 🚧 **Project status:** Early development. The current release focuses
> on core visual design, local project workflows, and Dart code preview.
> It does not yet replace the Flutter SDK or a full Flutter IDE.

------------------------------------------------------------------------

## ✨ Features

### 🧩 Visual UI Designer

-   Drag and drop supported widgets onto a visual canvas.
-   Build layouts with **Text**, **Button**, **Container**, **Row**, and
    **Column** widgets.
-   Select and edit widget properties through the property inspector.
-   Select multiple widgets together.
-   Copy, duplicate, paste, and delete widgets.

### ↩️ Editing History

-   Undo and redo design changes.
-   Maintain up to **100 history steps per canvas**.

### 🗂️ Project & Canvas Management

-   Work with multiple canvases in a project.
-   Support up to **20 canvases**.
-   Save design data locally with automatic saving.
-   Browse project files using the built-in file explorer.

### 📦 Design Portability

-   Export projects and canvases as versioned JSON files.
-   Import JSON designs with validation and a preview before applying
    them.
-   Create automatic snapshots and restore previous saved states.
-   Manage local design storage.

### 💻 Dart Code Workflow

-   Preview generated Dart code.
-   Copy generated code to the clipboard.
-   Apply generated code to `lib/main.dart` through an explicit
    confirmation flow.
-   Validate and back up the target file as part of the apply workflow.

### 📝 Built-in Text Editor

-   Open and edit UTF-8 text files in the project.
-   Detect external file changes to help avoid overwriting newer
    content.
-   Create backups during supported save operations.
-   Enforce a 1 MiB file-size limit.

------------------------------------------------------------------------

## 🖥️ Platform Support

  Requirement        Support
  ------------------ -------------------------
  Operating system   Windows 10 / Windows 11
  Desktop runtime    Tauri 2
  WebView            Microsoft Edge WebView2
  Architecture       Desktop application

The application currently targets Windows desktop environments.

------------------------------------------------------------------------

## 🛠️ Technology Stack

  Technology           Purpose
  -------------------- ---------------------------------------------------
  🦀 Rust              Native desktop commands and filesystem operations
  ⚛️ React 19          User interface
  📘 TypeScript        Application logic and type safety
  ⚡ Vite              Frontend development and bundling
  🖥️ Tauri 2           Desktop application runtime
  🧪 Vitest            Frontend testing
  🧰 Testing Library   UI component testing
  📦 pnpm              Package management

------------------------------------------------------------------------

## 🏗️ Project Structure

The codebase is organized by application features and shared
functionality.

``` text
src/
├── app/                 # Application composition
├── features/
│   ├── canvas/          # Visual canvas and widget interactions
│   ├── dart/            # Dart code generation and preview
│   ├── editor/           # Built-in text editor
│   ├── files/            # Project file explorer and file workflows
│   ├── inspector/        # Widget property inspector
│   └── project/          # Project and canvas management
└── shared/
    ├── components/      # Reusable UI components
    ├── lib/             # Shared utilities
    └── styles/          # Global styles and design tokens

src-tauri/
├── src/
│   └── commands/        # Rust/Tauri backend commands
└── capabilities/        # Tauri application permissions
```

Feature modules depend on shared functionality rather than the reverse,
helping keep the application modular.

------------------------------------------------------------------------

## 🚀 Getting Started

### 1. Prerequisites

Install the following tools:

-   [Node.js](https://nodejs.org/) **22.12.0 or later**
-   [pnpm](https://pnpm.io/)
-   [Rust](https://www.rust-lang.org/tools/install)
-   [Microsoft Edge WebView2
    Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
    (required on Windows)

You may also need the Windows build tools required by Tauri. Follow the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### 2. Clone the repository

``` bash
git clone https://github.com/akilama471/FlutterVisulStudio.git
cd FlutterVisulStudio
```

### 3. Install dependencies

``` bash
pnpm install
```

### 4. Run in development mode

``` bash
pnpm tauri dev
```

### 5. Build the desktop application

``` bash
pnpm tauri build
```

------------------------------------------------------------------------

## 🧪 Development Commands

Run the available project checks from the repository root.

  Command               Description
  --------------------- ------------------------------------------------------
  `pnpm dev`            Start the Vite development server
  `pnpm build`          Run TypeScript project builds and build the frontend
  `pnpm typecheck`      Check TypeScript types
  `pnpm lint`           Run ESLint
  `pnpm format:check`   Check code formatting
  `pnpm test`           Run Vitest tests
  `pnpm tauri dev`      Run the desktop application in development mode
  `pnpm tauri build`    Build the desktop application

------------------------------------------------------------------------

## ⚠️ Current Scope & Limitations

Flutter UI Studio is a visual UI design tool in active development. The
following capabilities are **not currently implemented**:

-   Running Flutter applications or invoking the Flutter toolchain.
-   Running `flutter analyze`, `flutter format`, or Flutter builds.
-   Full Flutter widget coverage.
-   Responsive breakpoints and advanced constraint-based layouts.
-   Theme management and advanced styling workflows.
-   Asset management, animations, and gesture configuration.
-   Cloud synchronization, user accounts, or real-time collaboration.
-   Creating, renaming, moving, or deleting project files through the
    file explorer.
-   Advanced code-editor features such as syntax highlighting, code
    folding, search/replace, and diagnostics.
-   Editing generated Dart code before applying it to the project.

The generated Dart preview should be treated as a starting point, not as
a guarantee that a complete Flutter application is ready to run.

------------------------------------------------------------------------

## 🔐 Data & Safety

-   Project and design data are stored locally.
-   JSON imports are validated before they are applied.
-   Applying generated code requires an explicit confirmation.
-   The apply workflow includes backend-side validation and backup
    handling.
-   The built-in editor checks for external file changes to reduce
    accidental overwrites.

**Note:** Keep independent backups of important projects. Local
snapshots and application backups should not be treated as a replacement
for version control.

------------------------------------------------------------------------

## 🗺️ Roadmap

The roadmap below describes possible future areas of development; it
does not imply that these features are already available.

-   [ ] Expand the supported Flutter widget library.
-   [ ] Add responsive layout and breakpoint controls.
-   [ ] Improve theme and styling support.
-   [ ] Add asset management.
-   [ ] Improve generated Dart code customization.
-   [ ] Add Flutter SDK integration for analyze and build workflows.
-   [ ] Improve editor tooling and diagnostics.
-   [ ] Explore project portability and collaboration features.

------------------------------------------------------------------------

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome.

1.  Fork the repository.
2.  Create a feature branch.
3.  Make your changes and add or update tests where appropriate.
4.  Run the relevant checks.
5.  Open a pull request with a clear description of the changes.

For larger changes, open an issue first to discuss the proposed
implementation.

------------------------------------------------------------------------

## 📄 License

This project is licensed under the **GNU General Public License v3.0
(GPL-3.0)**. See the [`LICENSE`](LICENSE) file for details.

------------------------------------------------------------------------

## 🌟 Support the Project

If you find Flutter UI Studio useful:

-   ⭐ Star the repository.
-   🐛 Report bugs and suggest improvements.
-   💡 Share ideas for useful Flutter UI design features.
-   🤝 Contribute code or documentation.

**Repository:** https://github.com/akilama471/FlutterVisulStudio

------------------------------------------------------------------------

```{=html}
<p align="center">
```
Made with ❤️ for the Flutter developer community.
```{=html}
</p>
```
