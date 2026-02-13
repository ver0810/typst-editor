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
import { FolderOpen, List, Search, Box, Settings } from "lucide-react";
import "./App.css";
import { Toolbar } from "./Toolbar";
import { MenuBar } from "./MenuBar";
import { typstCompletion, updateDocument } from "./TypstLsp";

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
  { tag: tags.keyword, color: "#c678dd", fontWeight: "bold" },
  { tag: tags.function(tags.variableName), color: "#61afef" },
  { tag: tags.function(tags.variableName), color: "#61afef" },
  { tag: tags.definition(tags.variableName), color: "#61afef" },
  { tag: tags.constant(tags.bool), color: "#d19a66" },
  { tag: tags.number, color: "#d19a66" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.special(tags.string), color: "#c678dd" },
  { tag: tags.comment, color: "#5c6370", fontStyle: "italic" },
  { tag: tags.variableName, color: "#e06c75" },
  { tag: tags.propertyName, color: "#e5c07b" },
  { tag: tags.operator, color: "#56b6c2" },
  { tag: tags.bracket, color: "#abb2bf" },
  { tag: tags.meta, color: "#56b6c2" },
  { tag: tags.link, color: "#61afef", textDecoration: "underline" },
  { tag: tags.tagName, color: "#e06c75" },
  { tag: tags.emphasis, color: "#98c379", fontStyle: "italic" },
  { tag: tags.strong, color: "#d19a66", fontWeight: "bold" },
  { tag: tags.strikethrough, color: "#5c6370", textDecoration: "line-through" },
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

  const sendCompile = useCallback((text: string) => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setCompiling(true);

    invoke("compile_typst", { content: text, revision }).catch((err) => {
      setError(String(err));
      setCompiling(false);
    });
  }, []);

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
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        sendCompile(value);
      }, 300);
    },
    [sendCompile],
  );

  useEffect(() => {
    const unlistenPatch = listen<{ revision: number; pages: PagePatch[] }>(
      "typst-patch",
      (event) => {
        setPages((prev) => mergePatch(prev, event.payload.pages));
        setError(null);
        setCompiling(false);
      },
    );

    const unlistenError = listen<{ revision: number; message: string }>(
      "typst-error",
      (event) => {
        setError(event.payload.message);
        setCompiling(false);
      },
    );

    sendCompile(DEFAULT_CONTENT);

    return () => {
      unlistenPatch.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [sendCompile]);

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

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-obsidian-900 text-obsidian-200">
      <MenuBar
        editorViewRef={editorViewRef}
        zoomPercent={zoomPercent}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onZoomFit={handleZoomFit}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
      />

      <div className="flex h-[calc(100vh-44px)] min-h-0">
        <aside className="flex w-12 flex-col items-center gap-2 border-r border-obsidian-700 bg-obsidian-850 py-3">
          <button
            className={`rounded-md p-2 hover:bg-white/10 ${sidebarView === "files" && sidebarVisible ? "text-indigo-400" : "text-obsidian-400 hover:text-obsidian-200"}`}
            title="文件"
            onClick={() =>
              sidebarVisible && sidebarView === "files"
                ? setSidebarVisible(false)
                : (setSidebarView("files"), setSidebarVisible(true))
            }
          >
            <FolderOpen size={18} />
          </button>
          <button
            className={`rounded-md p-2 hover:bg-white/10 ${sidebarView === "outline" && sidebarVisible ? "text-indigo-400" : "text-obsidian-400 hover:text-obsidian-200"}`}
            title="大纲"
            onClick={() =>
              sidebarVisible && sidebarView === "outline"
                ? setSidebarVisible(false)
                : (setSidebarView("outline"), setSidebarVisible(true))
            }
          >
            <List size={18} />
          </button>
          <button
            className={`rounded-md p-2 hover:bg-white/10 ${sidebarView === "search" && sidebarVisible ? "text-indigo-400" : "text-obsidian-400 hover:text-obsidian-200"}`}
            title="搜索"
            onClick={() =>
              sidebarVisible && sidebarView === "search"
                ? setSidebarVisible(false)
                : (setSidebarView("search"), setSidebarVisible(true))
            }
          >
            <Search size={18} />
          </button>
          <button
            className={`rounded-md p-2 hover:bg-white/10 ${sidebarView === "extensions" && sidebarVisible ? "text-indigo-400" : "text-obsidian-400 hover:text-obsidian-200"}`}
            title="扩展"
            onClick={() =>
              sidebarVisible && sidebarView === "extensions"
                ? setSidebarVisible(false)
                : (setSidebarView("extensions"), setSidebarVisible(true))
            }
          >
            <Box size={18} />
          </button>
          <button
            className={`mt-auto rounded-md p-2 hover:bg-white/10 ${sidebarView === "settings" && sidebarVisible ? "text-indigo-400" : "text-obsidian-400 hover:text-obsidian-200"}`}
            title="设置"
            onClick={() =>
              sidebarVisible && sidebarView === "settings"
                ? setSidebarVisible(false)
                : (setSidebarView("settings"), setSidebarVisible(true))
            }
          >
            <Settings size={18} />
          </button>
        </aside>

        {sidebarVisible && (
          <aside
            className="flex flex-col border-r border-obsidian-700 bg-obsidian-850 text-obsidian-300"
            style={{ width: sidebarWidth }}
          >
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {sidebarView === "files" && (
                <>
                  <div className="space-y-2">
                    <div className="px-2 text-[11px] uppercase tracking-[0.6px] text-obsidian-400">
                      工作区
                    </div>
                    <div className="rounded-md border border-indigo-400/40 bg-indigo-400/15 px-2 py-1 text-sm text-indigo-100">
                      当前文档
                    </div>
                    <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                      示例模板
                    </div>
                    <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                      最近打开
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="px-2 text-[11px] uppercase tracking-[0.6px] text-obsidian-400">
                      文件
                    </div>
                    <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                      main.typ
                    </div>
                    <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                      styles.typ
                    </div>
                    <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                      refs.bib
                    </div>
                  </div>
                </>
              )}
              {sidebarView === "outline" && (
                <div className="space-y-2">
                  <div className="px-2 text-[11px] uppercase tracking-[0.6px] text-obsidian-400">
                    大纲
                  </div>
                  <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                    欢迎使用 Typst
                  </div>
                  <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                    数学
                  </div>
                  <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                    列表
                  </div>
                  <div className="rounded-md px-2 py-1 text-sm hover:bg-white/5">
                    表格
                  </div>
                </div>
              )}
              {sidebarView === "search" && (
                <div className="space-y-2">
                  <div className="px-2 text-[11px] uppercase tracking-[0.6px] text-obsidian-400">
                    搜索
                  </div>
                  <div className="rounded-md px-2 py-1 text-sm text-obsidian-400">
                    搜索功能开发中...
                  </div>
                </div>
              )}
              {sidebarView === "extensions" && (
                <div className="space-y-2">
                  <div className="px-2 text-[11px] uppercase tracking-[0.6px] text-obsidian-400">
                    扩展
                  </div>
                  <div className="rounded-md px-2 py-1 text-sm text-obsidian-400">
                    扩展功能开发中...
                  </div>
                </div>
              )}
              {sidebarView === "settings" && (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-obsidian-200">
                    编辑器
                  </div>
                  <div className="space-y-3 rounded-lg bg-obsidian-800/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">字体大小</span>
                      <select className="w-24 rounded border border-obsidian-600 bg-obsidian-700 px-2 py-1 text-sm text-obsidian-200">
                        <option>14px</option>
                        <option>16px</option>
                        <option>18px</option>
                        <option>20px</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">字体</span>
                      <select className="w-32 rounded border border-obsidian-600 bg-obsidian-700 px-2 py-1 text-sm text-obsidian-200">
                        <option>JetBrains Mono</option>
                        <option>Fira Code</option>
                        <option>Source Code Pro</option>
                        <option>Consolas</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">行高</span>
                      <select className="w-24 rounded border border-obsidian-600 bg-obsidian-700 px-2 py-1 text-sm text-obsidian-200">
                        <option>1.4</option>
                        <option>1.5</option>
                        <option>1.6</option>
                        <option>1.8</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">制表符</span>
                      <select className="w-24 rounded border border-obsidian-600 bg-obsidian-700 px-2 py-1 text-sm text-obsidian-200">
                        <option>2 空格</option>
                        <option>4 空格</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">自动换行</span>
                      <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-indigo-500" />
                    </div>
                  </div>
                  <div className="text-sm font-medium text-obsidian-200">
                    界面
                  </div>
                  <div className="space-y-3 rounded-lg bg-obsidian-800/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">暗色主题</span>
                      <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-indigo-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">显示行号</span>
                      <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-indigo-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-obsidian-300">显示空白字符</span>
                      <input type="checkbox" className="h-4 w-4 rounded accent-indigo-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        <div
          className="w-1 cursor-col-resize bg-obsidian-700 hover:bg-indigo-400/60 active:bg-indigo-400/80"
          onPointerDown={handleSidebarResize}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-obsidian-900">
          <Toolbar
            editorViewRef={editorViewRef}
            zoomPercent={zoomPercent}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            onZoomFit={handleZoomFit}
          />
          <div ref={splitContainerRef} className="flex min-h-0 flex-1">
            <section
              className="editor-scroll flex min-w-0 min-h-0 flex-col bg-obsidian-800"
              style={{ width: `${splitRatio * 100}%` }}
            >
              <div className="flex h-9 items-center border-b border-obsidian-700 bg-obsidian-850 px-3 text-[11px] uppercase tracking-[0.7px] text-obsidian-300">
                编辑器
              </div>
              <div className="relative min-h-0 flex-1">
                <CodeMirror
                  value={content}
                  onChange={handleChange}
                  theme="dark"
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
              className="relative z-10 w-1 cursor-col-resize bg-obsidian-700 hover:bg-indigo-400/60 active:bg-indigo-400/80 transition-colors"
              onPointerDown={handleSplitPointerDown}
            />

            <section
              className="relative flex min-w-0 min-h-0 flex-col bg-obsidian-800"
              style={{ width: `${(1 - splitRatio) * 100}%` }}
            >
              <div className="flex h-9 items-center border-b border-obsidian-700 bg-obsidian-850 px-3 text-[11px] uppercase tracking-[0.7px] text-obsidian-300">
                预览
              </div>
              {compiling && (
                <div className="absolute right-4 top-12 z-10 rounded-md border border-white/10 bg-obsidian-900/90 px-2.5 py-1 text-xs text-obsidian-300">
                  正在编译...
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
                      className="mx-auto mb-4"
                      style={{
                        width: scaledWidthPx,
                        height: scaledHeightPx,
                      }}
                    >
                      <div
                        className="relative overflow-hidden bg-white shadow-panel"
                        style={{
                          width: page.pageSize.w * PT_TO_PX,
                          height: page.pageSize.h * PT_TO_PX,
                          transform: `scale(${pageScale})`,
                          transformOrigin: "top left",
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
                <div className="sticky bottom-0 border-t border-red-400/40 bg-red-900/80 px-3 py-2 text-xs text-red-200">
                  <span className="mr-2 inline-flex rounded bg-red-500 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-white">
                    错误
                  </span>
                  {error}
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

function toSpanRange(span?: PatchSpanRange | null): SpanRange | undefined {
  if (!span) {
    return undefined;
  }
  return {
    lineStart: span.line_start,
    lineEnd: span.line_end,
  };
}

function mergePatch(prev: PageState[], pages: PagePatch[]): PageState[] {
  const map = new Map<number, PageState>();
  for (const page of prev) {
    map.set(page.pageIndex, page);
  }

  for (const patch of pages) {
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
