import { useState, useCallback, useEffect, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readDir } from "@tauri-apps/plugin-fs";
import { join, basename } from "@tauri-apps/api/path";

export type FileNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  isExpanded?: boolean;
};

export type OpenFile = {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  isNew?: boolean;
};

const RECENT_FILES_KEY = "typst-editor-recent-files";
const MAX_RECENT_FILES = 10;

export function useFileManager() {
  const [currentFile, setCurrentFile] = useState<OpenFile | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载最近打开的文件列表
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRecentFiles(parsed);
      } catch {
        localStorage.removeItem(RECENT_FILES_KEY);
      }
    }
  }, []);

  // 添加到最近打开的文件
  const addToRecentFiles = useCallback((filePath: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f !== filePath);
      const updated = [filePath, ...filtered].slice(0, MAX_RECENT_FILES);
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 从最近打开的文件中移除
  const removeFromRecentFiles = useCallback((filePath: string) => {
    setRecentFiles((prev) => {
      const updated = prev.filter((f) => f !== filePath);
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 读取文件树
  const loadFileTree = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    try {
      const entries = await readDir(dirPath);
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        // 跳过隐藏文件和 node_modules
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        const fullPath = await join(dirPath, entry.name);
        const isDirectory = entry.isDirectory;

        const node: FileNode = {
          name: entry.name,
          path: fullPath,
          isDirectory,
          isExpanded: false,
        };

        if (isDirectory) {
          node.children = []; // 延迟加载子目录
        }

        nodes.push(node);
      }

      // 排序：目录在前，文件在后，按名称排序
      return nodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      console.error("Failed to load file tree:", err);
      return [];
    }
  }, []);

  // 展开目录
  const expandDirectory = useCallback(async (node: FileNode) => {
    if (!node.isDirectory || !node.path) return;

    try {
      const children = await loadFileTree(node.path);
      setFileTree((prev) => updateNodeInTree(prev, node.path, { ...node, children, isExpanded: true }));
    } catch (err) {
      setError(`无法展开目录: ${node.name}`);
    }
  }, [loadFileTree]);

  // 折叠目录
  const collapseDirectory = useCallback((node: FileNode) => {
    setFileTree((prev) => updateNodeInTree(prev, node.path, { ...node, isExpanded: false }));
  }, []);

  // 更新树中的节点
  const updateNodeInTree = (nodes: FileNode[], targetPath: string, update: FileNode): FileNode[] => {
    return nodes.map((node) => {
      if (node.path === targetPath) {
        return update;
      }
      if (node.children) {
        return { ...node, children: updateNodeInTree(node.children, targetPath, update) };
      }
      return node;
    });
  };

  // 打开工作区
  const openWorkspace = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择工作区文件夹",
      });

      if (selected && typeof selected === "string") {
        setIsLoading(true);
        setWorkspaceRoot(selected);
        const tree = await loadFileTree(selected);
        setFileTree(tree);
        setIsLoading(false);
      }
    } catch (err) {
      setError("无法打开工作区");
      setIsLoading(false);
    }
  }, [loadFileTree]);

  // 打开文件
  const openFile = useCallback(async (filePath?: string) => {
    try {
      let targetPath = filePath;

      if (!targetPath) {
        const selected = await open({
          multiple: false,
          filters: [
            { name: "Typst 文件", extensions: ["typ"] },
            { name: "所有文件", extensions: ["*"] },
          ],
          title: "打开文件",
        });

        if (selected && typeof selected === "string") {
          targetPath = selected;
        } else {
          return;
        }
      }

      setIsLoading(true);
      const content = await readTextFile(targetPath);
      const fileName = await basename(targetPath);

      const newFile: OpenFile = {
        path: targetPath,
        name: fileName,
        content,
        isDirty: false,
      };

      setCurrentFile(newFile);
      addToRecentFiles(targetPath);
      setIsLoading(false);
      return newFile;
    } catch (err) {
      setError(`无法打开文件: ${err}`);
      setIsLoading(false);
      if (filePath) {
        removeFromRecentFiles(filePath);
      }
    }
  }, [addToRecentFiles, removeFromRecentFiles]);

  // 从工作区树中打开文件
  const openFileFromTree = useCallback(async (node: FileNode) => {
    if (node.isDirectory) {
      if (node.isExpanded) {
        collapseDirectory(node);
      } else {
        await expandDirectory(node);
      }
      return;
    }

    await openFile(node.path);
  }, [openFile, expandDirectory, collapseDirectory]);

  // 新建文件
  const newFile = useCallback(() => {
    const newFile: OpenFile = {
      path: "",
      name: "未命名.typ",
      content: "",
      isDirty: true,
      isNew: true,
    };
    setCurrentFile(newFile);
    return newFile;
  }, []);

  // 保存文件
  const saveFile = useCallback(async (content: string, filePath?: string) => {
    try {
      let targetPath = filePath || currentFile?.path;

      // 如果是新文件或需要另存为
      if (!targetPath || currentFile?.isNew) {
        const selected = await save({
          filters: [
            { name: "Typst 文件", extensions: ["typ"] },
            { name: "所有文件", extensions: ["*"] },
          ],
          defaultPath: currentFile?.name || "未命名.typ",
          title: "保存文件",
        });

        if (selected) {
          targetPath = selected;
        } else {
          return false;
        }
      }

      await writeTextFile(targetPath, content);
      const fileName = await basename(targetPath);

      const savedFile: OpenFile = {
        path: targetPath,
        name: fileName,
        content,
        isDirty: false,
        isNew: false,
      };

      setCurrentFile(savedFile);
      addToRecentFiles(targetPath);

      // 如果在工作区内，刷新文件树
      if (workspaceRoot && targetPath.startsWith(workspaceRoot)) {
        const tree = await loadFileTree(workspaceRoot);
        setFileTree(tree);
      }

      return true;
    } catch (err) {
      setError(`保存文件失败: ${err}`);
      return false;
    }
  }, [currentFile, addToRecentFiles, workspaceRoot, loadFileTree]);

  // 另存为
  const saveAs = useCallback(async (content: string) => {
    try {
      const selected = await save({
        filters: [
          { name: "Typst 文件", extensions: ["typ"] },
          { name: "所有文件", extensions: ["*"] },
        ],
        defaultPath: currentFile?.name || "未命名.typ",
        title: "另存为",
      });

      if (selected) {
        await writeTextFile(selected, content);
        const fileName = await basename(selected);

        const savedFile: OpenFile = {
          path: selected,
          name: fileName,
          content,
          isDirty: false,
          isNew: false,
        };

        setCurrentFile(savedFile);
        addToRecentFiles(selected);
        return true;
      }
      return false;
    } catch (err) {
      setError(`另存为失败: ${err}`);
      return false;
    }
  }, [currentFile, addToRecentFiles]);

  // 标记文件为已修改
  const markAsDirty = useCallback((isDirty: boolean = true) => {
    setCurrentFile((prev) => (prev ? { ...prev, isDirty } : null));
  }, []);

  // 更新当前文件内容
  const updateContent = useCallback((content: string) => {
    setCurrentFile((prev) => (prev ? { ...prev, content, isDirty: true } : null));
  }, []);

  // 自动保存
  const setupAutoSave = useCallback((content: string, delay: number = 5000) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (currentFile?.path && !currentFile.isNew) {
      autoSaveTimerRef.current = setTimeout(async () => {
        if (currentFile.isDirty) {
          await saveFile(content);
        }
      }, delay);
    }
  }, [currentFile, saveFile]);

  // 清除自动保存定时器
  const clearAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  // 刷新工作区
  const refreshWorkspace = useCallback(async () => {
    if (workspaceRoot) {
      setIsLoading(true);
      const tree = await loadFileTree(workspaceRoot);
      setFileTree(tree);
      setIsLoading(false);
    }
  }, [workspaceRoot, loadFileTree]);

  // 清理
  useEffect(() => {
    return () => {
      clearAutoSave();
    };
  }, [clearAutoSave]);

  return {
    // 状态
    currentFile,
    workspaceRoot,
    fileTree,
    recentFiles,
    isLoading,
    error,

    // 文件操作
    newFile,
    openFile,
    openFileFromTree,
    saveFile,
    saveAs,
    openWorkspace,
    refreshWorkspace,

    // 文件树操作
    expandDirectory,
    collapseDirectory,

    // 内容管理
    updateContent,
    markAsDirty,

    // 自动保存
    setupAutoSave,
    clearAutoSave,

    // 最近文件
    addToRecentFiles,
    removeFromRecentFiles,
    clearError: () => setError(null),
  };
}
