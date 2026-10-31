import { describe, expect, it } from "vitest";
import { createInitialCanvasState, createWidget, type CanvasNode } from "../canvas/model";
import { dartColor, escapeDartString, generateDart } from "./generateDart";

function screenWith(children: CanvasNode[]): CanvasNode {
  const screen = createWidget("screen");
  screen.children = children;
  return screen;
}

describe("generateDart", () => {
  it("generates the complete starter document", () => {
    const state = createInitialCanvasState();

    const expected = [
      "import 'package:flutter/material.dart';",
      "",
      "void main() {",
      "  runApp(const StudioApp());",
      "}",
      "",
      "class StudioApp extends StatelessWidget {",
      "  const StudioApp({super.key});",
      "",
      "  @override",
      "  Widget build(BuildContext context) {",
      "    return MaterialApp(",
      "      title: 'Flutter UI Studio',",
      "      debugShowCheckedModeBanner: false,",
      "      home: const StudioScreen(),",
      "    );",
      "  }",
      "}",
      "",
      "class StudioScreen extends StatelessWidget {",
      "  const StudioScreen({super.key});",
      "",
      "  @override",
      "  Widget build(BuildContext context) {",
      "    return Scaffold(",
      "      backgroundColor: const Color(0xFFFFFFFF),",
      "      body: SafeArea(",
      "        child: Padding(",
      "          padding: const EdgeInsets.all(24),",
      "          child: Column(",
      "            crossAxisAlignment: CrossAxisAlignment.start,",
      "            children: [",
      "              Column(",
      "                crossAxisAlignment: CrossAxisAlignment.start,",
      "                children: [",
      "                  Text(",
      "                    'Hello, Flutter!',",
      "                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),",
      "                  ),",
      "                  const SizedBox(height: 14),",
      "                  ElevatedButton(",
      "                    onPressed: () {},",
      "                    child: const Text('Get started'),",
      "                  ),",
      "                ],",
      "              ),",
      "            ],",
      "          ),",
      "        ),",
      "      ),",
      "    );",
      "  }",
      "}",
      "",
    ].join("\n");

    expect(generateDart(state.root)).toBe(expected);
  });

  it("uses the screen background and supports an empty screen", () => {
    const screen = screenWith([]);
    screen.props.background = "#102030";

    const code = generateDart(screen);

    expect(code).toContain("backgroundColor: const Color(0xFF102030),");
    expect(code).toContain("padding: const EdgeInsets.all(24),");
    expect(code).toContain("children: const [],");
  });

  it("generates Text and Button widgets", () => {
    const screen = screenWith([
      createWidget("text", { content: "A heading" }),
      createWidget("button", { label: "Continue" }),
    ]);

    const code = generateDart(screen);

    expect(code).toContain("'A heading',");
    expect(code).toContain("style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),");
    expect(code).toContain("ElevatedButton(");
    expect(code).toContain("onPressed: () {},");
    expect(code).toContain("child: const Text('Continue'),");
  });

  it("escapes text and labels for Dart strings", () => {
    const screen = screenWith([
      createWidget("text", { content: "It's $5 \\ path\nnext\tend" }),
      createWidget("button", { label: "Don't" }),
    ]);

    const code = generateDart(screen);

    expect(code).toContain("'It\\'s \\$5 \\\\ path\\nnext\\tend',");
    expect(code).toContain("child: const Text('Don\\'t'),");
    expect(escapeDartString("a'b\\c$d\ne\tf\r")).toBe("a\\'b\\\\c\\$d\\ne\\tf\\r");
  });

  it("emits vertical and horizontal spacers for gaps", () => {
    const column = createWidget("column", { gap: 14 });
    column.children = [
      createWidget("text", { content: "One" }),
      createWidget("text", { content: "Two" }),
    ];

    const row = createWidget("row", { gap: 12 });
    row.children = [
      createWidget("text", { content: "Left" }),
      createWidget("text", { content: "Right" }),
    ];

    const code = generateDart(screenWith([column, row]));

    expect(code).toContain("const SizedBox(height: 14),");
    expect(code).toContain("const SizedBox(width: 12),");
  });

  it("omits spacers when gaps are zero", () => {
    const column = createWidget("column", { gap: 0 });
    column.children = [
      createWidget("text", { content: "One" }),
      createWidget("text", { content: "Two" }),
    ];

    const code = generateDart(screenWith([column]));

    expect(code).not.toContain("SizedBox(height:");
  });

  it("generates containers with padding, colour, and children", () => {
    const container = createWidget("container", {
      padding: 24,
      gap: 0,
      background: "#abc",
    });
    container.children = [createWidget("text", { content: "Inside" })];

    const code = generateDart(screenWith([container]));

    expect(code).toContain("Container(");
    expect(code).toContain("padding: const EdgeInsets.all(24),");
    expect(code).toContain("color: const Color(0xFFAABBCC),");
    expect(code).toContain("child: Column(");
    expect(code).toContain("'Inside',");
  });

  it("falls back for invalid colours", () => {
    const screen = screenWith([]);
    screen.props.background = "not-a-colour";

    const container = createWidget("container", { background: "#12" });
    const code = generateDart(screenWith([container, ...screen.children]));

    expect(generateDart(screen)).toContain("backgroundColor: const Color(0xFFFFFFFF),");
    expect(code).toContain("color: const Color(0xFF000000),");
  });

  it("parses short and long hex colours", () => {
    expect(dartColor("#abc", "FF000000")).toBe("const Color(0xFFAABBCC)");
    expect(dartColor(" #123456 ", "FF000000")).toBe("const Color(0xFF123456)");
    expect(dartColor("", "FF000000")).toBe("const Color(0xFF000000)");
  });

  it("is deterministic and ends with a single newline", () => {
    const screen = screenWith([createWidget("text", { content: "Stable" })]);

    const first = generateDart(screen);
    const second = generateDart(screen);

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first.endsWith("\n\n")).toBe(false);
  });
});
