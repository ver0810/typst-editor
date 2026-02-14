import React from "react";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { undo as cmUndo, redo as cmRedo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import {
  PanelLeft,
  Undo2,
  Redo2,
  Search,
  Replace,
  Scissors,
  Clipboard,
  Copy,
  Minus,
  Plus,
  Maximize2,
  FileText,
  FolderOpen,
  Save,
  Download,
  Clock,
  Info,
  BookOpen,
  CheckSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface MenuBarProps {
  editorViewRef: React.RefObject<EditorView | null>;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomFit: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  currentFileName?: string | null;
  isDirty?: boolean;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onSaveFile?: () => void;
  onSaveAs?: () => void;
  onExportPdf?: () => void;
  recentFiles?: string[];
  onOpenRecentFile?: (path: string) => void;
}

export function MenuBar({
  editorViewRef,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFit,
  sidebarVisible,
  onToggleSidebar,
  currentFileName,
  isDirty,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onSaveFile,
  onSaveAs,
  onExportPdf,
  recentFiles = [],
  onOpenRecentFile,
}: MenuBarProps) {
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

  const handleFind = () => {
    runCommand((view) => openSearchPanel(view));
  };

  const handleReplace = () => {
    runCommand((view) => {
      openSearchPanel(view);
    });
  };

  const handleCut = () => {
    runCommand((view) => {
      const { state } = view;
      const { from, to } = state.selection.main;
      if (from !== to) {
        const selectedText = state.sliceDoc(from, to);
        navigator.clipboard.writeText(selectedText);
        view.dispatch({
          changes: { from, to, insert: "" },
        });
      }
    });
  };

  const handleCopy = () => {
    runCommand((view) => {
      const { state } = view;
      const { from, to } = state.selection.main;
      if (from !== to) {
        const selectedText = state.sliceDoc(from, to);
        navigator.clipboard.writeText(selectedText);
      }
    });
  };

  const handlePaste = async () => {
    runCommand(async (view) => {
      const text = await navigator.clipboard.readText();
      const { state, dispatch } = view;
      const { from, to } = state.selection.main;
      dispatch({
        changes: { from, to, insert: text },
        selection: EditorSelection.cursor(from + text.length),
      });
    });
  };

  const handleSelectAll = () => {
    runCommand((view) => {
      view.dispatch({
        selection: EditorSelection.range(0, view.state.doc.length),
      });
    });
  };

  return (
    <div className="flex h-9 items-center gap-1 border-b border-obsidian-700 bg-obsidian-800 px-2">
      <button
        onClick={onToggleSidebar}
        className={`flex h-9 w-9 rounded-md items-center justify-center hover:bg-obsidian-750 ${sidebarVisible ? "text-indigo-400" : "text-obsidian-300"}`}
        title={sidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
      >
        <PanelLeft size={18} />
      </button>
      <div className="h-5 w-px bg-obsidian-600" />
      {/* File Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-obsidian-300 hover:bg-obsidian-750 hover:text-obsidian-200"
          >
            文件
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
        >
          <DropdownMenuItem onClick={() => onNewFile?.()}>
            <FileText size={15} className="mr-2" />
            新建
            <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenFile?.()}>
            <FileText size={15} className="mr-2" />
            打开文件
            <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenFolder?.()}>
            <FolderOpen size={15} className="mr-2" />
            打开文件夹
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onSaveFile?.()}>
            <Save size={15} className="mr-2" />
            保存
            <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSaveAs?.()}>
            <Save size={15} className="mr-2" />
            另存为
            <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onExportPdf?.()}>
            <Download size={15} className="mr-2" />
            导出 PDF
          </DropdownMenuItem>
          {recentFiles.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                最近打开
              </div>
              {recentFiles.slice(0, 5).map((filePath) => (
                <DropdownMenuItem
                  key={filePath}
                  className="truncate"
                  onClick={() => onOpenRecentFile?.(filePath)}
                  title={filePath}
                >
                  <Clock size={15} className="mr-2 flex-shrink-0" />
                  <span className="truncate">{filePath.split(/[/\\]/).pop()}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-obsidian-300 hover:bg-obsidian-750 hover:text-obsidian-200"
          >
            编辑
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
        >
          <DropdownMenuItem onClick={handleUndo}>
            <Undo2 size={15} className="mr-2" />
            撤销
            <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRedo}>
            <Redo2 size={15} className="mr-2" />
            重做
            <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCut}>
            <Scissors size={15} className="mr-2" />
            剪切
            <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}>
            <Copy size={15} className="mr-2" />
            复制
            <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePaste}>
            <Clipboard size={15} className="mr-2" />
            粘贴
            <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleFind}>
            <Search size={15} className="mr-2" />
            查找
            <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleReplace}>
            <Replace size={15} className="mr-2" />
            查找和替换
            <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSelectAll}>
            <CheckSquare size={15} className="mr-2" />
            全选
            <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-obsidian-300 hover:bg-obsidian-750 hover:text-obsidian-200"
          >
            查看
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-48"
        >
          <DropdownMenuItem onClick={onZoomIn}>
            <Plus size={15} className="mr-2" />
            放大
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onZoomOut}>
            <Minus size={15} className="mr-2" />
            缩小
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onZoomReset}>
            缩放: {zoomPercent}%
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onZoomFit}>
            <Maximize2 size={15} className="mr-2" />
            适合宽度
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-obsidian-300 hover:bg-obsidian-750 hover:text-obsidian-200"
          >
            帮助
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-48"
        >
          <DropdownMenuItem>
            <BookOpen size={15} className="mr-2" />
            文档
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Info size={15} className="mr-2" />
            关于
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Current File Info */}
      {currentFileName && (
        <div className="ml-4 flex items-center gap-2 text-sm text-obsidian-400">
          <span className="truncate max-w-xs">{currentFileName}</span>
          {isDirty && <span className="text-indigo-400">●</span>}
        </div>
      )}
    </div>
  );
}
