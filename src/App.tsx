import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import { history } from "@codemirror/commands";
import { highlightSelectionMatches } from "@codemirror/search";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { tags } from "@lezer/highlight";
import { FolderOpen, List, Search, Box, Settings, RefreshCw } from "lucide-react";
import "./App.css";
import { Toolbar } from "./Toolbar";
import { MenuBar } from "./MenuBar";
import { typstCompletion, updateDocument } from "./TypstLsp";
import { useFileManager } from "./hooks/useFileManager";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { FileTree } from "./components/FileTree";
import { RecentFilesList } from "./components/RecentFiles";
import { SettingsPanel } from "./components/SettingsPanel";

const typstKeywords = [
  "let",
  "set",
  "show",
  "if",
  "else",
  "for",
  "while",
  "return",
  "break",
  "continue",
  "import",
  "include",
  "as",
  "in",
  "where",
  "func",
  "const",
];

const typstFunctions = [
  "text",
  "strong",
  "emph",
  "underline",
  "strike",
  "raw",
  "math",
  "equation",
  "figure",
  "table",
  "image",
  "rect",
  "circle",
  "line",
  "polygon",
  "ellipse",
  "path",
  "svg",
  "align",
  "center",
  "left",
  "right",
  "justify",
  "columns",
  "grid",
  "stack",
  "gap",
  "page",
  "par",
  "heading",
  "list",
  "enum",
  "term",
  "outline",
  "bibliography",
  "ref",
  "label",
  "cite",
  "footnote",
  "note",
  "quote",
  "block",
  "place",
  "move",
  "rotate",
  "scale",
  "skew",
  "v",
  "h",
  "space",
  "quad",
  "dots",
  "package",
  "document",
  "box",
  "hide",
  "reveal",
  "synthesize",
  "context",
  "locate",
  "query",
  "counter",
  "state",
  "selector",
  "style",
];

const typstBuiltin = [
  "auto",
  "true",
  "false",
  "none",
  "this",
  "self",
  "super",
  "it",
  "args",
];

const typstAtoms = ["and", "or", "not", "at", "is", "isnt"];

const typstUnits = [
  "pt",
  "px",
  "mm",
  "cm",
  "in",
  "em",
  "ex",
  "rem",
  "fr",
  "deg",
  "rad",
  "s",
  "ms",
];

const typstColors = [
  "black",
  "white",
  "gray",
  "grey",
  "silver",
  "maroon",
  "red",
  "purple",
  "fuchsia",
  "green",
  "lime",
  "olive",
  "yellow",
  "navy",
  "blue",
  "teal",
  "aqua",
  "orange",
  "aliceblue",
  "antiquewhite",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "blanchedalmond",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "greenyellow",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "limegreen",
  "linen",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "oldlace",
  "olivedrab",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "whitesmoke",
  "yellowgreen",
  "rebeccapurple",
  "hz",
  "luma",
  "oklch",
  "oklab",
  "color",
];

function tokenize(stream: any, _state: any): string | null {
  if (stream.eatSpace()) return null;
  const ch = stream.peek();

  if (ch === "/" && stream.match(/\/\/.*/)) {
    stream.skipToEnd();
    return "comment";
  }

  if (ch === "/" && stream.match(/\/\*[\s\S]*?\*\//)) {
    return "comment";
  }

  if (ch === "`" && stream.match(/`[^`]*`/)) {
    return "special";
  }

  if (ch === "#" && stream.match(/#[\w-]+/)) {
    return "keyword";
  }

  if (ch === "#") {
    stream.next();
    if (stream.match(/[\w-]+\s*\(/)) {
      return "function";
    }
    if (stream.match(/[\w-]+/)) {
      const word = stream.current();
      if (typstKeywords.includes(word) || typstFunctions.includes(word)) {
        return "keyword";
      }
      return "function";
    }
    return "meta";
  }

  if (ch === "*" || ch === "_" || ch === "~") {
    const ch2 = stream.peek(1);
    if (ch2 === ch) {
      if (stream.match(/[*_~]{2}[\s\S]*?[*_~]{2}/)) return "strong";
    }
    if (stream.match(/[*_~][^*_~\s][*\s\S]*?[*_~]/)) {
      return "emphasis";
    }
  }

  if ((ch === "^" || ch === "~") && stream.match(/[\^~][\w\s]+[\^~]/)) {
    return "meta";
  }

  if (ch === "$") {
    stream.next();
    if (stream.match(/\$\$[\s\S]*?\$\$/)) return "meta";
    if (stream.match(/\$[^\$]+\$/)) return "meta";
    if (stream.match(/\$/)) return "meta";
    stream.match(/[^\$]*/);
    return "string";
  }

  if (ch === "@" && stream.match(/@[\w-]+/)) {
    return "tagName";
  }

  if (ch === "<" && stream.match(/<\w+>/)) {
    return "link";
  }

  if (ch === "." && stream.match(/\.\w+/)) {
    return "propertyName";
  }

  if (stream.match(/-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/)) {
    const rest = stream.peek();
    if (typstUnits.some((u) => rest.startsWith(u))) {
      stream.match(/[a-zA-Z%]+/);
    }
    return "number";
  }

  if (ch === '"') {
    stream.next();
    while (!stream.eol()) {
      if (stream.next() === '"') break;
      if (stream.peek() === "\\") stream.next();
    }
    return "string";
  }

  if (stream.match(/@"[^*<>"]+"/)) {
    return "special";
  }

  if (stream.match(/[\w-]+/)) {
    const word = stream.current();
    if (typstKeywords.includes(word)) return "keyword";
    if (typstFunctions.includes(word)) return "function";
    if (typstBuiltin.includes(word)) return "atom";
    if (typstAtoms.includes(word)) return "keyword";
    if (typstColors.includes(word.toLowerCase())) return "special";

    const pos = stream.pos;
    if (stream.eatSpace() && stream.peek() === "(") {
      stream.pos = pos;
      return "function";
    }
    stream.pos = pos;

    return "variableName";
  }

  if (stream.match(/[+\-*/=<>^_@.#%:&|~?!]+/)) return "operator";

  if (stream.match(/[{}()\[\]]/)) return "bracket";

  stream.next();
  return null;
}

const typstLanguage = StreamLanguage.define({ token: tokenize });

const typstHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "bold" },
  { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.definition(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.constant(tags.bool), color: "var(--syntax-number)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.special(tags.string), color: "var(--syntax-keyword)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.variableName, color: "var(--syntax-markup)" },
  { tag: tags.propertyName, color: "var(--syntax-function)" },
  { tag: tags.operator, color: "var(--text-muted)" },
  { tag: tags.bracket, color: "var(--text-muted)" },
  { tag: tags.meta, color: "var(--syntax-code)" },
  { tag: tags.link, color: "var(--syntax-code)", textDecoration: "underline" },
  { tag: tags.tagName, color: "var(--syntax-markup)" },
  { tag: tags.emphasis, color: "var(--syntax-string)", fontStyle: "italic" },
  { tag: tags.strong, color: "var(--syntax-markup)", fontWeight: "bold" },
  { tag: tags.strikethrough, color: "var(--text-muted)", textDecoration: "line-through" },
]);

const typstExtensions = [
  typstLanguage,
  syntaxHighlighting(typstHighlightStyle),
];

const DEFAULT_CONTENT = `= 欢迎使用 Typst

这是一个 *Typst* 编辑器，支持实时预览。

== 数学

$ E = m c^2 $

$ integral_0^infinity e^(-x^2) dif x = sqrt(pi) / 2 $

== 列表

- 第一项
- 第二项
- 第三项

== 表格

#table(
  columns: 3,
  [名称], [数量], [状态],
  [Alpha], [12], [完成],
  [Beta], [8], [进行中],
)
`;

const PT_TO_PX = 96 / 72;
const PAGE_GAP_PX = 24;
const PREVIEW_BUFFER_PX = 600;
const PREVIEW_PADDING_PX = 32;

function App() {
  // 主题管理
  const [theme, setTheme] = useState<"paper" | "midnight">(() => {
    const stored = localStorage.getItem("typst-editor-theme");
    return (stored as "paper" | "midnight") || "midnight";
  });

  useEffect(() => {
    localStorage.setItem("typst-editor-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 文件管理
  const {
    currentFile,
    workspaceRoot,
    fileTree,
    recentFiles,
    isLoading: fileLoading,
    error: fileError,
    newFile,
    openFile,
    openFileFromTree,
    saveFile,
    saveAs,
    openWorkspace,
    refreshWorkspace,
    updateContent: updateFileContent,
    setupAutoSave,
    clearAutoSave,
    removeFromRecentFiles,
  } = useFileManager();

  // 键盘快捷键
  useKeyboardShortcuts({
    onNewFile: newFile,
    onOpenFile: openFile,
    onSaveFile: () => currentFile && saveFile(content),
    onSaveAs: () => saveAs(content),
  });

  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [pages, setPages] = useState<PageState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [sidebarView, setSidebarView] = useState<
    "files" | "outline" | "search" | "extensions" | "settings"
  >("files");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef(new Map<string, HTMLDivElement>());
  const [activeLine, setActiveLine] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [manualZoom, setManualZoom] = useState(1);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const previewDragRef = useRef<{
    active: boolean;
    didDrag: boolean;
    startX: number;
    startY: number;
    scrollX: number;
    scrollY: number;
  }>({
    active: false,
    didDrag: false,
    startX: 0,
    startY: 0,
    scrollX: 0,
    scrollY: 0,
  });

  const editorExtensions = useMemo(() => {
    const extensions = [
      ...typstExtensions,
      EditorView.lineWrapping,
      history(),
      highlightSelectionMatches(),
      autocompletion({ override: [typstCompletion] }),
      EditorView.updateListener.of((update) => {
        editorViewRef.current = update.view;
        if (update.selectionSet) {
          const line = update.state.doc.lineAt(
            update.state.selection.main.head,
          ).number;
          setActiveLine(line);
        }
        if (update.docChanged) {
          updateDocument(update.state.doc.toString());
        }
      }),
    ];

    return extensions;
  }, []);

  const sendCompile = useCallback((text: string, filePath?: string) => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setCompiling(true);

    invoke("compile_typst", { content: text, revision, filePath }).catch((err) => {
      setError(String(err));
      setCompiling(false);
    });
  }, []);

  // PDF 导出处理
  const handleExportPdf = useCallback(async () => {
    try {
      setCompiling(true);
      const result = await invoke<string>("export_pdf", {
        content,
        filePath: currentFile?.path,
      });
      console.log("PDF exported to:", result);
      setError(null);
    } catch (err) {
      console.error("Failed to export PDF:", err);
      setError(String(err));
    } finally {
      setCompiling(false);
    }
  }, [content, currentFile?.path]);

  const scrollEditorToLine = useCallback((line: number) => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    const clampedLine = Math.max(1, Math.min(line, view.state.doc.lines));
    const pos = view.state.doc.line(clampedLine).from;
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    view.focus();
  }, []);

  const findBlockForLine = useCallback(
    (line: number) => {
      for (const page of pages) {
        for (const block of page.blocks) {
          const span = block.span;
          if (span && line >= span.lineStart && line <= span.lineEnd) {
            return { block, pageIndex: page.pageIndex };
          }
        }
      }
      return null;
    },
    [pages],
  );

  const sortedPages = useMemo(() => {
    return pages.slice().sort((a, b) => a.pageIndex - b.pageIndex);
  }, [pages]);

  const activeTarget = useMemo(() => {
    return findBlockForLine(activeLine);
  }, [activeLine, findBlockForLine]);

  const autoScale = useMemo(() => {
    if (!containerWidth || !sortedPages.length) {
      return 1;
    }
    const availableWidth = containerWidth - PREVIEW_PADDING_PX * 2;
    const maxPageWidthPt = Math.max(...sortedPages.map((p) => p.pageSize.w));
    const maxPageWidthPx = maxPageWidthPt * PT_TO_PX;
    if (maxPageWidthPx <= availableWidth) {
      return 1;
    }
    return availableWidth / maxPageWidthPx;
  }, [containerWidth, sortedPages]);

  const pageScale = manualZoom;
  const zoomPercent = Math.round(pageScale * 100);

  const handleZoomIn = () => {
    setManualZoom((z) => Math.min(z + 0.1, 3));
  };

  const handleZoomOut = () => {
    setManualZoom((z) => Math.max(z - 0.1, 0.25));
  };

  const handleZoomReset = () => setManualZoom(1);

  const handleWheelZoom = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setManualZoom((z) => Math.min(Math.max(z + delta, 0.25), 3));
  }, []);

  const handlePreviewPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const container = previewRef.current;
    if (!container) return;
    previewDragRef.current = {
      active: true,
      didDrag: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollX: container.scrollLeft,
      scrollY: container.scrollTop,
    };
    container.setPointerCapture(e.pointerId);
    container.style.cursor = "grabbing";
  }, []);

  const handlePreviewPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = previewDragRef.current;
    if (!drag.active) return;
    const container = previewRef.current;
    if (!container) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.didDrag && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.didDrag = true;
    }
    container.scrollLeft = drag.scrollX - dx;
    container.scrollTop = drag.scrollY - dy;
  }, []);

  const handlePreviewPointerUp = useCallback((e: React.PointerEvent) => {
    if (!previewDragRef.current.active) return;
    previewDragRef.current.active = false;
    const container = previewRef.current;
    if (container) {
      container.releasePointerCapture(e.pointerId);
      container.style.cursor = "";
    }
  }, []);

  const handleZoomFit = useCallback(() => {
    setManualZoom(autoScale);
  }, [autoScale]);

  const handleSplitPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.classList.add("col-resizing");

    const onMove = (ev: PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(Math.max(ratio, 0.2), 0.8));
    };

    const onUp = () => {
      draggingRef.current = false;
      document.body.classList.remove("col-resizing");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const preview = previewRef.current;
      if (preview) {
        setContainerWidth(preview.clientWidth);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);

  const sidebarDragRef = useRef(false);

  const handleSidebarResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    sidebarDragRef.current = true;
    document.body.classList.add("col-resizing");

    const onMove = (ev: PointerEvent) => {
      if (!sidebarDragRef.current) return;
      const newWidth = ev.clientX - 48;
      setSidebarWidth(Math.min(Math.max(newWidth, 150), 500));
    };

    const onUp = () => {
      sidebarDragRef.current = false;
      document.body.classList.remove("col-resizing");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);

  const visiblePageSet = useMemo(() => {
    const set = new Set<number>();
    if (!sortedPages.length) {
      return set;
    }

    const start = Math.max(scrollTop - PREVIEW_BUFFER_PX, 0);
    const end = scrollTop + viewHeight + PREVIEW_BUFFER_PX;
    let offset = 0;

    for (const page of sortedPages) {
      const heightPx = page.pageSize.h * PT_TO_PX * pageScale;
      const pageStart = offset;
      const pageEnd = offset + heightPx;
      if (pageEnd >= start && pageStart <= end) {
        set.add(page.pageIndex);
      }
      offset += heightPx + PAGE_GAP_PX;
    }

    if (activeTarget) {
      set.add(activeTarget.pageIndex);
    }

    return set;
  }, [activeTarget, pageScale, scrollTop, sortedPages, viewHeight]);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      updateFileContent(value);
      setupAutoSave(value, 3000);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        sendCompile(value, currentFile?.path || undefined);
      }, 300);
    },
    [sendCompile, updateFileContent, setupAutoSave, currentFile?.path],
  );

  useEffect(() => {
    const unlistenPatch = listen<{
      revision: number;
      pages: PagePatch[];
      total_pages: number;
    }>("typst-patch", (event) => {
      setPages((prev) =>
        mergePatch(prev, event.payload.pages, event.payload.total_pages),
      );
      setError(null);
      setCompiling(false);
    });

    const unlistenError = listen<{ revision: number; message: string }>(
      "typst-error",
      (event) => {
        setError(event.payload.message);
        setCompiling(false);
      },
    );

    sendCompile(DEFAULT_CONTENT, currentFile?.path || undefined);

    return () => {
      unlistenPatch.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [sendCompile, currentFile?.path]);

  useEffect(() => {
    const target = activeTarget?.block;
    if (!target) {
      return;
    }
    const container = previewRef.current;
    const blockEl = blockRefs.current.get(target.blockId);
    if (!container || !blockEl) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();
    const offset = blockRect.top - containerRect.top + container.scrollTop - 16;
    container.scrollTo({ top: Math.max(offset, 0), behavior: "smooth" });
  }, [activeTarget]);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) {
      return;
    }

    setViewHeight(container.clientHeight);
    setContainerWidth(container.clientWidth);

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheelZoom, { passive: false });

    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        setViewHeight(container.clientHeight);
        if (!draggingRef.current) {
          setContainerWidth(container.clientWidth);
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheelZoom);
      resizeObserver?.disconnect();
    };
  }, [handleWheelZoom]);

  // 当打开的文件变化时，更新编辑器内容
  useEffect(() => {
    if (currentFile) {
      setContent(currentFile.content);
      sendCompile(currentFile.content, currentFile.path);
    }
  }, [currentFile?.path]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      clearAutoSave();
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-obsidian-900 text-obsidian-200 overflow-hidden">
      <MenuBar
        editorViewRef={editorViewRef}
        zoomPercent={zoomPercent}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onZoomFit={handleZoomFit}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        currentFileName={currentFile?.name}
        isDirty={currentFile?.isDirty}
        onNewFile={newFile}
        onOpenFile={openFile}
        onOpenFolder={openWorkspace}
        onSaveFile={() => currentFile && saveFile(content)}
        onSaveAs={() => saveAs(content)}
        onExportPdf={handleExportPdf}
        recentFiles={recentFiles}
        onOpenRecentFile={openFile}
      />

      <div className="flex h-[calc(100vh-40px)] min-h-0">
        <aside className="flex w-12 flex-col items-center gap-1 border-r border-obsidian-700/40 bg-obsidian-850/60 py-2">
          <ActivityBarButton
            icon={<FolderOpen size={20} />}
            title="文件"
            isActive={sidebarView === "files" && sidebarVisible}
            onClick={() =>
              sidebarVisible && sidebarView === "files"
                ? setSidebarVisible(false)
                : (setSidebarView("files"), setSidebarVisible(true))
            }
          />
          <ActivityBarButton
            icon={<List size={20} />}
            title="大纲"
            isActive={sidebarView === "outline" && sidebarVisible}
            onClick={() =>
              sidebarVisible && sidebarView === "outline"
                ? setSidebarVisible(false)
                : (setSidebarView("outline"), setSidebarVisible(true))
            }
          />
          <ActivityBarButton
            icon={<Search size={20} />}
            title="搜索"
            isActive={sidebarView === "search" && sidebarVisible}
            onClick={() =>
              sidebarVisible && sidebarView === "search"
                ? setSidebarVisible(false)
                : (setSidebarView("search"), setSidebarVisible(true))
            }
          />
          <ActivityBarButton
            icon={<Box size={20} />}
            title="扩展"
            isActive={sidebarView === "extensions" && sidebarVisible}
            onClick={() =>
              sidebarVisible && sidebarView === "extensions"
                ? setSidebarVisible(false)
                : (setSidebarView("extensions"), setSidebarVisible(true))
            }
          />
          <div className="flex-1" />
          <ActivityBarButton
            icon={<Settings size={20} />}
            title="设置"
            isActive={sidebarView === "settings" && sidebarVisible}
            onClick={() =>
              sidebarVisible && sidebarView === "settings"
                ? setSidebarVisible(false)
                : (setSidebarView("settings"), setSidebarVisible(true))
            }
          />
        </aside>

        {sidebarVisible && (
          <aside
            className="flex flex-col border-r border-obsidian-700/40 bg-obsidian-850/40 text-obsidian-300 backdrop-blur-subtle"
            style={{ width: sidebarWidth }}
          >
            <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-4">
              {sidebarView === "files" && (
                <>
                  {/* 文件操作错误提示 */}
                  {fileError && (
                    <div className="mb-3 rounded-lg border border-red-500/30 bg-red-950/80 backdrop-blur px-3 py-2 text-xs text-red-200">
                      {fileError}
                    </div>
                  )}
                  {/* 文件加载状态 */}
                  {fileLoading && (
                    <div className="mb-3 flex items-center gap-2 px-2 text-xs text-obsidian-400">
                      <RefreshCw size={14} className="animate-spin" />
                      加载中...
                    </div>
                  )}
                  {/* 工作区部分 */}
                  <div className="mb-5 space-y-2">
                    <div className="flex items-center justify-between px-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-obsidian-500">
                        工作区
                      </div>
                      <button
                        onClick={openWorkspace}
                        className="rounded-lg p-1.5 text-obsidian-400 hover:bg-obsidian-750/60 hover:text-obsidian-200 transition-all"
                        title="打开工作区"
                      >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                    {workspaceRoot ? (
                      <>
                        <div className="px-2 text-xs text-obsidian-500 truncate" title={workspaceRoot}>
                          {workspaceRoot}
                        </div>
                        <div className="flex items-center justify-end px-2">
                          <button
                            onClick={refreshWorkspace}
                            className="rounded-lg p-1.5 text-obsidian-400 hover:bg-obsidian-750/60 hover:text-obsidian-200 transition-all"
                            title="刷新"
                          >
                            <RefreshCw size={14} />
                          </button>
                        </div>
                        <FileTree
                          nodes={fileTree}
                          currentFilePath={currentFile?.path}
                          onFileClick={openFileFromTree}
                        />
                      </>
                    ) : (
                      <div className="px-2 py-6 text-center">
                        <button
                          onClick={openWorkspace}
                          className="rounded-lg border border-dashed border-obsidian-600/60 px-4 py-2.5 text-sm text-obsidian-400 hover:border-[var(--accent-color)]/50 hover:text-obsidian-300 transition-all"
                        >
                          打开文件夹
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 最近打开的文件 */}
                  {recentFiles.length > 0 && (
                    <div className="space-y-2 mt-5 pt-4 border-t border-obsidian-700/30">
                      <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-obsidian-500">
                        最近打开
                      </div>
                      <RecentFilesList
                        files={recentFiles}
                        onFileClick={openFile}
                        onRemoveFile={removeFromRecentFiles}
                      />
                    </div>
                  )}
                </>
              )}
              {sidebarView === "outline" && (
                <div className="space-y-1">
                  <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-obsidian-500 mb-2">
                    大纲
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm text-obsidian-300 hover:bg-obsidian-750/50 transition-colors cursor-pointer">
                    欢迎使用 Typst
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm text-obsidian-300 hover:bg-obsidian-750/50 transition-colors cursor-pointer pl-5">
                    数学
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm text-obsidian-300 hover:bg-obsidian-750/50 transition-colors cursor-pointer pl-5">
                    列表
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm text-obsidian-300 hover:bg-obsidian-750/50 transition-colors cursor-pointer pl-5">
                    表格
                  </div>
                </div>
              )}
              {sidebarView === "search" && (
                <div className="space-y-2">
                  <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-obsidian-500 mb-2">
                    搜索
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm text-obsidian-400 bg-obsidian-750/20">
                    搜索功能开发中...
                  </div>
                </div>
              )}
              {sidebarView === "extensions" && (
                <div className="space-y-2">
                  <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-obsidian-500 mb-2">
                    扩展
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm text-obsidian-400 bg-obsidian-750/20">
                    扩展功能开发中...
                  </div>
                </div>
              )}
              {sidebarView === "settings" && (
                <SettingsPanel 
                  isDark={theme === "midnight"} 
                  theme={theme}
                  onThemeChange={setTheme}
                />
              )}
            </div>
          </aside>
        )}

        {sidebarVisible && (
          <div
            className="w-1 cursor-col-resize bg-transparent hover:bg-[var(--accent-color)]/20 active:bg-[var(--accent-color)]/30 transition-colors flex items-center justify-center"
            onPointerDown={handleSidebarResize}
          >
            <div className="w-1 h-8 rounded-full bg-obsidian-500/40" />
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-obsidian-900/10">
          <Toolbar
            editorViewRef={editorViewRef}
            zoomPercent={zoomPercent}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            onZoomFit={handleZoomFit}
            onExportPdf={handleExportPdf}
          />
          <div ref={splitContainerRef} className="flex min-h-0 flex-1 gap-2 p-2">
            <section
              className="editor-scroll flex min-w-0 min-h-0 flex-col rounded-lg overflow-hidden border border-obsidian-700/20"
              style={{ 
                width: `${splitRatio * 100}%`,
                backgroundColor: "var(--editor-float-bg, #1E1E24)",
                boxShadow: "var(--shadow-float)"
              }}
            >
              <div className="relative min-h-0 flex-1">
                <CodeMirror
                  value={content}
                  onChange={handleChange}
                  theme={theme === "paper" ? "light" : "dark"}
                  height="100%"
                  className="absolute inset-0"
                  extensions={editorExtensions}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                  }}
                />
              </div>
            </section>

            <div
              className="relative z-10 w-1 cursor-col-resize hover:bg-[var(--accent-color)]/20 active:bg-[var(--accent-color)]/30 transition-colors self-stretch my-4 flex items-center justify-center"
              onPointerDown={handleSplitPointerDown}
            >
              <div className="w-1 h-8 rounded-full bg-obsidian-500/40" />
            </div>

            <section
              className="relative flex min-w-0 min-h-0 flex-col rounded-lg overflow-hidden border border-obsidian-700/20"
              style={{ 
                width: `${(1 - splitRatio) * 100}%`,
                backgroundColor: "var(--preview-container-bg)",
                boxShadow: "var(--shadow-float)"
              }}
            >
              {compiling && (
                <div className="absolute right-4 top-4 z-10 rounded-lg border border-white/5 bg-obsidian-900/95 backdrop-blur px-3 py-1.5 text-xs text-obsidian-300 shadow-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse" />
                    正在编译...
                  </div>
                </div>
              )}
              
              <div
                ref={previewRef}
                className="preview-scroll min-h-0 flex-1 cursor-grab overflow-auto p-4"
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
              >
                {sortedPages.map((page) => {
                  const isVisible = visiblePageSet.has(page.pageIndex);
                  const scaledWidthPx = page.pageSize.w * PT_TO_PX * pageScale;
                  const scaledHeightPx = page.pageSize.h * PT_TO_PX * pageScale;

                  if (!isVisible) {
                    return (
                      <div
                        key={page.pageIndex}
                        className="mx-auto mb-4"
                        style={{
                          width: scaledWidthPx,
                          height: scaledHeightPx,
                        }}
                      />
                    );
                  }

                  return (
                    <div
                      key={page.pageIndex}
                      className="mx-auto mb-8"
                      style={{
                        width: scaledWidthPx,
                        height: scaledHeightPx,
                      }}
                    >
                      <div
                        className="relative overflow-hidden bg-white"
                        style={{
                          width: page.pageSize.w * PT_TO_PX,
                          height: page.pageSize.h * PT_TO_PX,
                          transform: `scale(${pageScale})`,
                          transformOrigin: "top left",
                          boxShadow: "var(--shadow-pdf)"
                        }}
                      >
                        {page.blocks.map((block) => (
                          <div
                            key={block.blockId}
                            ref={(el) => {
                              if (el) {
                                blockRefs.current.set(block.blockId, el);
                              } else {
                                blockRefs.current.delete(block.blockId);
                              }
                            }}
                            className="preview-block absolute"
                            style={
                              block.bbox
                                ? {
                                    left: block.bbox.x * PT_TO_PX,
                                    top: block.bbox.y * PT_TO_PX,
                                    width: block.bbox.w * PT_TO_PX,
                                    height: block.bbox.h * PT_TO_PX,
                                  }
                                : undefined
                            }
                            onClick={() => {
                              if (previewDragRef.current.didDrag) return;
                              if (block.span) {
                                scrollEditorToLine(block.span.lineStart);
                              }
                            }}
                            dangerouslySetInnerHTML={{ __html: block.svg }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {error && (
                <div className="sticky bottom-0 border-t border-red-500/30 bg-red-950/90 backdrop-blur px-4 py-3 text-xs text-red-200">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex rounded-md bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      错误
                    </span>
                    <span className="flex-1">{error}</span>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;

type PagePatch = {
  page_index: number;
  page_hash: number;
  page_size: PageSize;
  blocks: BlockPatch[];
  removed_blocks: string[];
};

type BlockPatch = {
  block_id: string;
  hash: number;
  svg: string;
  bbox?: BBox | null;
  span?: PatchSpanRange | null;
};

type BBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type PageSize = {
  w: number;
  h: number;
};

type PatchSpanRange = {
  line_start: number;
  line_end: number;
};

type SpanRange = {
  lineStart: number;
  lineEnd: number;
};

type BlockState = {
  blockId: string;
  hash: number;
  svg: string;
  bbox?: BBox;
  span?: SpanRange;
};

type PageState = {
  pageIndex: number;
  pageHash: number;
  pageSize: PageSize;
  blocks: BlockState[];
};

function ActivityBarButton({
  icon,
  title,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
        isActive
          ? "text-[var(--accent-color)] bg-obsidian-750/60"
          : "text-obsidian-400 hover:text-obsidian-200 hover:bg-obsidian-750/30"
      }`}
      title={title}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function toSpanRange(span?: PatchSpanRange | null): SpanRange | undefined {
  if (!span) {
    return undefined;
  }
  return {
    lineStart: span.line_start,
    lineEnd: span.line_end,
  };
}

function mergePatch(
  prev: PageState[],
  pages: PagePatch[],
  totalPages: number,
): PageState[] {
  const map = new Map<number, PageState>();
  for (const page of prev) {
    if (page.pageIndex < totalPages) {
      map.set(page.pageIndex, page);
    }
  }

  for (const patch of pages) {
    if (patch.page_index >= totalPages) continue;

    const existing = map.get(patch.page_index);
    const blockMap = new Map<string, BlockState>();

    if (existing) {
      for (const block of existing.blocks) {
        blockMap.set(block.blockId, block);
      }
    }

    for (const block of patch.blocks) {
      blockMap.set(block.block_id, {
        blockId: block.block_id,
        hash: block.hash,
        svg: block.svg,
        bbox: block.bbox ?? undefined,
        span: toSpanRange(block.span),
      });
    }

    for (const removed of patch.removed_blocks) {
      blockMap.delete(removed);
    }

    map.set(patch.page_index, {
      pageIndex: patch.page_index,
      pageHash: patch.page_hash,
      pageSize: patch.page_size,
      blocks: Array.from(blockMap.values()),
    });
  }

  return Array.from(map.values());
}
