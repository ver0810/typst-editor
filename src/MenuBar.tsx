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
  LogOut,
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
        className={`flex h-9 w-9 rounded-md items-center justify-center hover:bg-white/10 ${sidebarVisible ? "text-indigo-400" : "text-obsidian-300"}`}
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
            className="text-obsidian-300 hover:bg-white/10 hover:text-obsidian-100"
          >
            文件
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 bg-obsidian-700 border-obsidian-600"
        >
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <FileText size={15} className="mr-2" />
            新建
            <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <FolderOpen size={15} className="mr-2" />
            打开
            <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <Save size={15} className="mr-2" />
            保存
            <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <Save size={15} className="mr-2" />
            另存为
            <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <Download size={15} className="mr-2" />
            导出 PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <Clock size={15} className="mr-2" />
            最近打开
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <LogOut size={15} className="mr-2" />
            退出
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-obsidian-300 hover:bg-white/10 hover:text-obsidian-100"
          >
            编辑
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 bg-obsidian-700 border-obsidian-600"
        >
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleUndo}
          >
            <Undo2 size={15} className="mr-2" />
            撤销
            <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleRedo}
          >
            <Redo2 size={15} className="mr-2" />
            重做
            <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleCut}
          >
            <Scissors size={15} className="mr-2" />
            剪切
            <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleCopy}
          >
            <Copy size={15} className="mr-2" />
            复制
            <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handlePaste}
          >
            <Clipboard size={15} className="mr-2" />
            粘贴
            <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleFind}
          >
            <Search size={15} className="mr-2" />
            查找
            <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleReplace}
          >
            <Replace size={15} className="mr-2" />
            查找和替换
            <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={handleSelectAll}
          >
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
            className="text-obsidian-300 hover:bg-white/10 hover:text-obsidian-100"
          >
            查看
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-48 bg-obsidian-700 border-obsidian-600"
        >
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={onZoomIn}
          >
            <Plus size={15} className="mr-2" />
            放大
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={onZoomOut}
          >
            <Minus size={15} className="mr-2" />
            缩小
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={onZoomReset}
          >
            缩放: {zoomPercent}%
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem
            className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100"
            onClick={onZoomFit}
          >
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
            className="text-obsidian-300 hover:bg-white/10 hover:text-obsidian-100"
          >
            帮助
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-48 bg-obsidian-700 border-obsidian-600"
        >
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <BookOpen size={15} className="mr-2" />
            文档
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-obsidian-600" />
          <DropdownMenuItem className="text-obsidian-200 focus:bg-obsidian-600 focus:text-obsidian-100">
            <Info size={15} className="mr-2" />
            关于
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
