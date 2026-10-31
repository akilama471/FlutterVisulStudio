import type { CanvasNode } from "../canvas/model";

const INDENT = "  ";
const SCREEN_PADDING = 24;
const SCREEN_GAP = 18;

export function generateDart(root: CanvasNode): string {
  const screen = root.kind === "screen" ? root : null;
  const background = dartColor(screen?.props.background ?? "#ffffff", "FFFFFFFF");
  const body = withComma(emitScreenBody(screen));

  const lines = [
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
    `      backgroundColor: ${background},`,
    "      body: SafeArea(",
    "        child: Padding(",
    `          padding: const EdgeInsets.all(${SCREEN_PADDING}),`,
    `          child: ${body[0]}`,
    ...indentLines(body.slice(1), 5),
    "        ),",
    "      ),",
    "    );",
    "  }",
    "}",
    "",
  ];

  return lines.join("\n");
}

function emitScreenBody(screen: CanvasNode | null): string[] {
  const children = screen?.children ?? [];

  return [
    "Column(",
    "  crossAxisAlignment: CrossAxisAlignment.start,",
    ...indentLines(emitChildList(children, "height", SCREEN_GAP), 1),
    ")",
  ];
}

function emitWidget(node: CanvasNode): string[] {
  switch (node.kind) {
    case "text":
      return emitText(node);
    case "button":
      return emitButton(node);
    case "column":
      return emitFlex("Column", node, "height");
    case "row":
      return emitFlex("Row", node, "width");
    case "container":
      return emitContainer(node);
    case "screen":
      return emitScreenBody(node);
  }
}

function emitText(node: CanvasNode): string[] {
  return [
    "Text(",
    `  '${escapeDartString(node.props.content)}',`,
    "  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),",
    ")",
  ];
}

function emitButton(node: CanvasNode): string[] {
  return [
    "ElevatedButton(",
    "  onPressed: () {},",
    `  child: const Text('${escapeDartString(node.props.label)}'),`,
    ")",
  ];
}

function emitFlex(type: "Column" | "Row", node: CanvasNode, axis: "height" | "width"): string[] {
  return [
    `${type}(`,
    "  crossAxisAlignment: CrossAxisAlignment.start,",
    ...indentLines(emitChildList(node.children, axis, node.props.gap), 1),
    ")",
  ];
}

function emitContainer(node: CanvasNode): string[] {
  const lines = [
    "Container(",
    `  padding: const EdgeInsets.all(${size(node.props.padding)}),`,
    `  color: ${dartColor(node.props.background, "FF000000")},`,
  ];

  if (node.children.length > 0) {
    lines.push("  child: Column(");
    lines.push("    crossAxisAlignment: CrossAxisAlignment.start,");
    lines.push(...indentLines(emitChildList(node.children, "height", node.props.gap), 2));
    lines.push("  ),");
  }

  lines.push(")");
  return lines;
}

function emitChildList(children: CanvasNode[], axis: "height" | "width", gap: number): string[] {
  if (children.length === 0) {
    return ["children: const [],"];
  }

  const spacing = size(gap);
  const lines = ["children: ["];

  children.forEach((child, index) => {
    if (index > 0 && spacing > 0) {
      lines.push(`  const SizedBox(${axis}: ${spacing}),`);
    }

    lines.push(...indentLines(withComma(emitWidget(child)), 1));
  });

  lines.push("],");
  return lines;
}

export function dartColor(value: string, fallback: string): string {
  const hex = value.trim().replace(/^#/, "");

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return `const Color(0xFF${hex.toUpperCase()})`;
  }

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const expanded = hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
    return `const Color(0xFF${expanded.toUpperCase()})`;
  }

  return `const Color(0x${fallback.toUpperCase()})`;
}

export function escapeDartString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function size(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function indentLines(lines: string[], level: number): string[] {
  const prefix = INDENT.repeat(level);
  return lines.map((line) => (line.length > 0 ? `${prefix}${line}` : line));
}

function withComma(lines: string[]): string[] {
  if (lines.length === 0) {
    return lines;
  }

  const copy = [...lines];
  copy[copy.length - 1] = `${copy[copy.length - 1]},`;
  return copy;
}
