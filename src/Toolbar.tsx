import React, { useState } from "react";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { undo as cmUndo, redo as cmRedo } from "@codemirror/commands";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading,
  List,
  ListOrdered,
  Code,
  Link,
  Minus,
  Plus,
  Maximize2,
  Undo2,
  Redo2,
  FileDown,
  ChevronDown,
  Type,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ToolbarProps {
  editorViewRef: React.RefObject<EditorView | null>;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomFit: () => void;
  onExportPdf?: () => void;
}

const fonts = [
  { name: "宋体", value: "SimSun" },
  { name: "黑体", value: "SimHei" },
  { name: "微软雅黑", value: "Microsoft YaHei" },
  { name: "楷体", value: "KaiTi" },
  { name: "仿宋", value: "FangSong" },
  { name: "Arial", value: "Arial" },
  { name: "Times New Roman", value: "Times New Roman" },
];

export function Toolbar({
  editorViewRef,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFit,
  onExportPdf,
}: ToolbarProps) {
  const [selectedFont, setSelectedFont] = useState(fonts[2]);

  const runCommand = (action: (view: EditorView) => void) => {
    const editorView = editorViewRef.current;
    if (editorView) {
      action(editorView);
      editorView.focus();
    }
  };

  const handleUndo = () => {
    runCommand((view) => cmUndo(view));
  };

  const handleRedo = () => {
    runCommand((view) => cmRedo(view));
  };

  const handleFontChange = (font: typeof fonts[0]) => {
    setSelectedFont(font);
    runCommand((view) => {
      const { state, dispatch } = view;
      const { from, to } = state.selection.main;
      const selectedText = state.sliceDoc(from, to);
      
      if (selectedText) {
        dispatch({
          changes: { from, to, insert: `#text(font: "${font.value}")[${selectedText}]` },
        });
      } else {
        const insertText = `#text(font: "${font.value}")[文本]`;
        dispatch({
          changes: { from, insert: insertText },
        });
      }
    });
  };

  const toggleWrap = (prefix: string, suffix: string, placeholder = "text") => {
    runCommand((view) => {
      const { state, dispatch } = view;
      const { from, to } = state.selection.main;
      const selectedText = state.sliceDoc(from, to);

      const beforeStart = Math.max(0, from - prefix.length);
      const afterEnd = Math.min(state.doc.length, to + suffix.length);
      const textBefore = state.sliceDoc(beforeStart, from);
      const textAfter = state.sliceDoc(to, afterEnd);

      if (textBefore === prefix && textAfter === suffix) {
        dispatch({
          changes: [
            { from: beforeStart, to: from, insert: "" },
            { from: to, to: afterEnd, insert: "" },
          ],
          selection: EditorSelection.range(beforeStart, beforeStart + (to - from)),
        });
        return;
      }

      if (
        selectedText.length >= prefix.length + suffix.length &&
        selectedText.startsWith(prefix) &&
        selectedText.endsWith(suffix)
      ) {
        const inner = selectedText.slice(prefix.length, -suffix.length);
        dispatch({
          changes: { from, to, insert: inner },
          selection: EditorSelection.range(from, from + inner.length),
        });
        return;
      }

      if (selectedText) {
        dispatch({
          changes: { from, to, insert: `${prefix}${selectedText}${suffix}` },
          selection: EditorSelection.range(from + prefix.length, to + prefix.length),
        });
      } else {
        const text = prefix + placeholder + suffix;
        dispatch({
          changes: { from, insert: text },
          selection: EditorSelection.range(
            from + prefix.length,
            from + prefix.length + placeholder.length
          ),
        });
      }
    });
  };

  const togglePrefix = (prefix: string) => {
    runCommand((view) => {
      const { state, dispatch } = view;
      const changes: { from: number; to: number; insert: string }[] = [];
      let allHavePrefix = true;
      let singleEmptyLine = false;

      for (const range of state.selection.ranges) {
        for (
          let l = state.doc.lineAt(range.from).number;
          l <= state.doc.lineAt(range.to).number;
          l++
        ) {
          if (!state.doc.line(l).text.startsWith(prefix)) {
            allHavePrefix = false;
            break;
          }
        }
        if (!allHavePrefix) break;
      }

      const mainRange = state.selection.main;
      const startLine = state.doc.lineAt(mainRange.from).number;
      const endLine = state.doc.lineAt(mainRange.to).number;
      if (startLine === endLine && state.doc.line(startLine).text.trim() === "") {
        singleEmptyLine = true;
      }

      for (const range of state.selection.ranges) {
        for (
          let l = state.doc.lineAt(range.from).number;
          l <= state.doc.lineAt(range.to).number;
          l++
        ) {
          const lineObj = state.doc.line(l);
          if (allHavePrefix) {
            changes.push({ from: lineObj.from, to: lineObj.from + prefix.length, insert: "" });
          } else {
            changes.push({ from: lineObj.from, to: lineObj.from, insert: prefix });
          }
        }
      }

      if (singleEmptyLine && !allHavePrefix) {
        const lineObj = state.doc.line(startLine);
        const newPos = lineObj.from + prefix.length;
        dispatch({
          changes,
          selection: EditorSelection.cursor(newPos),
        });
      } else {
        dispatch({ changes });
      }
    });
  };

  const toggleHeading = () => {
    runCommand((view) => {
      const { state, dispatch } = view;
      const mainRange = state.selection.main;
      const lineObj = state.doc.lineAt(mainRange.from);
      const text = lineObj.text;

      const headingMatch = text.match(/^(=+)\s/);

      if (headingMatch) {
        const level = headingMatch[1].length;
        if (level >= 6) {
          dispatch({
            changes: { from: lineObj.from, to: lineObj.from + level + 1, insert: "" },
          });
        } else {
          dispatch({
            changes: { from: lineObj.from, to: lineObj.from, insert: "=" },
          });
        }
      } else {
        const insertText = "= ";
        const isEmptyLine = text.trim() === "";
        dispatch({
          changes: { from: lineObj.from, to: lineObj.from, insert: insertText },
          ...(isEmptyLine
            ? { selection: EditorSelection.cursor(lineObj.from + insertText.length) }
            : {}),
        });
      }
    });
  };

  const toggleFunction = (funcName: string, placeholder = "text") => {
    runCommand((view) => {
      const { state, dispatch } = view;
      const { from, to } = state.selection.main;
      const selectedText = state.sliceDoc(from, to);
      const wrapPrefix = `#${funcName}[`;
      const wrapSuffix = "]";

      const beforeStart = Math.max(0, from - wrapPrefix.length);
      const afterEnd = Math.min(state.doc.length, to + wrapSuffix.length);
      const textBefore = state.sliceDoc(beforeStart, from);
      const textAfter = state.sliceDoc(to, afterEnd);

      if (textBefore === wrapPrefix && textAfter === wrapSuffix) {
        dispatch({
          changes: [
            { from: beforeStart, to: from, insert: "" },
            { from: to, to: afterEnd, insert: "" },
          ],
          selection: EditorSelection.range(beforeStart, beforeStart + (to - from)),
        });
        return;
      }

      if (selectedText.startsWith(wrapPrefix) && selectedText.endsWith(wrapSuffix)) {
        const inner = selectedText.slice(wrapPrefix.length, -wrapSuffix.length);
        dispatch({
          changes: { from, to, insert: inner },
          selection: EditorSelection.range(from, from + inner.length),
        });
        return;
      }

      if (selectedText) {
        const insertText = `${wrapPrefix}${selectedText}${wrapSuffix}`;
        dispatch({
          changes: { from, to, insert: insertText },
          selection: EditorSelection.range(
            from + wrapPrefix.length,
            from + wrapPrefix.length + selectedText.length
          ),
        });
      } else {
        const text = `${wrapPrefix}${placeholder}${wrapSuffix}`;
        dispatch({
          changes: { from, insert: text },
          selection: EditorSelection.range(
            from + wrapPrefix.length,
            from + wrapPrefix.length + placeholder.length
          ),
        });
      }
    });
  };

  const handleLink = () => {
    runCommand((view) => {
      const { state, dispatch } = view;
      const { from, to } = state.selection.main;
      const selectedText = state.sliceDoc(from, to);
      const placeholder = "text";
      const urlPlaceholder = "url";

      const linkMatch = selectedText.match(/^#link\("([^"]*)"\)\[([^\]]*)\]$/);
      if (linkMatch) {
        const content = linkMatch[2];
        dispatch({
          changes: { from, to, insert: content },
          selection: EditorSelection.range(from, from + content.length),
        });
        return;
      }

      const outerFrom = Math.max(0, from - 50);
      const outerTo = Math.min(state.doc.length, to + 50);
      const surrounding = state.sliceDoc(outerFrom, outerTo);
      const relFrom = from - outerFrom;
      const relTo = to - outerFrom;

      for (const match of surrounding.matchAll(/#link\("([^"]*)"\)\[([^\]]*)\]/g)) {
        const mStart = match.index!;
        const mEnd = mStart + match[0].length;
        if (mStart <= relFrom && mEnd >= relTo) {
          const content = match[2];
          dispatch({
            changes: { from: outerFrom + mStart, to: outerFrom + mEnd, insert: content },
            selection: EditorSelection.range(
              outerFrom + mStart,
              outerFrom + mStart + content.length
            ),
          });
          return;
        }
      }

      if (selectedText) {
        const text = `#link("${urlPlaceholder}")[${selectedText}]`;
        dispatch({
          changes: { from, to, insert: text },
          selection: EditorSelection.range(from + 7, from + 7 + urlPlaceholder.length),
        });
      } else {
        const text = `#link("${urlPlaceholder}")[${placeholder}]`;
        dispatch({
          changes: { from, insert: text },
          selection: EditorSelection.range(from + 7, from + 7 + urlPlaceholder.length),
        });
      }
    });
  };

  return (
    <div className="flex h-10 items-center gap-1 border-b border-obsidian-700/30 bg-obsidian-800/50 px-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-obsidian-300 hover:bg-obsidian-750/60 hover:text-obsidian-200 transition-all">
            <Type size={16} />
            <span className="text-xs">{selectedFont.name}</span>
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {fonts.map((font) => (
            <DropdownMenuItem
              key={font.value}
              onClick={() => handleFontChange(font)}
              className={selectedFont.value === font.value ? "bg-obsidian-750/60" : ""}
            >
              {font.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator />

      <ToolbarButton
        icon={<Bold size={16} />}
        onClick={() => toggleWrap("*", "*")}
        title="Bold (*text*)"
      />
      <ToolbarButton
        icon={<Italic size={16} />}
        onClick={() => toggleWrap("_", "_")}
        title="Italic (_text_)"
      />
      <ToolbarButton
        icon={<Underline size={16} />}
        onClick={() => toggleFunction("underline")}
        title="Underline (#underline[text])"
      />
      <ToolbarButton
        icon={<Strikethrough size={16} />}
        onClick={() => toggleFunction("strike")}
        title="Strikethrough (#strike[text])"
      />

      <Separator />

      <ToolbarButton
        icon={<Heading size={16} />}
        onClick={toggleHeading}
        title="Heading (= )"
      />
      <ToolbarButton
        icon={<List size={16} />}
        onClick={() => togglePrefix("- ")}
        title="Bullet List (- )"
      />
      <ToolbarButton
        icon={<ListOrdered size={16} />}
        onClick={() => togglePrefix("+ ")}
        title="Numbered List (+ )"
      />

      <Separator />

      <ToolbarButton
        icon={<Code size={16} />}
        onClick={() => toggleWrap("`", "`", "code")}
        title="Code (`code`)"
      />
      <ToolbarButton
        icon={<Link size={16} />}
        onClick={handleLink}
        title="Link (#link)"
      />

      <div className="flex-1" />

      <ToolbarButton icon={<Undo2 size={16} />} onClick={handleUndo} title="撤销 (Ctrl+Z)" />
      <ToolbarButton icon={<Redo2 size={16} />} onClick={handleRedo} title="重做 (Ctrl+Y)" />

      <Separator />

      {onExportPdf && (
        <ToolbarButton icon={<FileDown size={16} />} onClick={onExportPdf} title="导出 PDF" />
      )}

      {onExportPdf && <Separator />}

      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-obsidian-750/30">
        <ToolbarButton icon={<Minus size={14} />} onClick={onZoomOut} title="Zoom Out" />
        <button
          onClick={onZoomReset}
          className="min-w-[44px] cursor-pointer px-2 text-center text-xs text-obsidian-300 font-medium transition hover:text-obsidian-200"
          title="Reset Zoom"
        >
          {zoomPercent}%
        </button>
        <ToolbarButton icon={<Plus size={14} />} onClick={onZoomIn} title="Zoom In" />
      </div>

      <Separator />

      <ToolbarButton icon={<Maximize2 size={16} />} onClick={onZoomFit} title="Fit Width" />
    </div>
  );
}

function ToolbarButton({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-obsidian-400 transition-all duration-200 hover:bg-obsidian-750/60 hover:text-obsidian-200 active:scale-95"
      onClick={onClick}
      title={title}
    >
      {icon}
    </button>
  );
}

function Separator() {
  return <div className="mx-1.5 h-4 w-px bg-obsidian-600/40" />;
}
