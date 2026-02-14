import { useState } from "react";
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from "lucide-react";
import type { FileNode } from "../hooks/useFileManager";

interface FileTreeProps {
  nodes: FileNode[];
  currentFilePath?: string | null;
  onFileClick: (node: FileNode) => void;
}

function FileTreeNode({
  node,
  depth,
  currentFilePath,
  onFileClick,
}: {
  node: FileNode;
  depth: number;
  currentFilePath?: string | null;
  onFileClick: (node: FileNode) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(node.isExpanded || false);
  const isCurrentFile = currentFilePath === node.path;

  const handleClick = () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);
    }
    onFileClick(node);
  };

  const paddingLeft = 8 + depth * 12;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-all duration-200 ${
          isCurrentFile
            ? "bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
            : "text-obsidian-300 hover:bg-obsidian-750/50 hover:text-obsidian-200"
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            <span className="flex h-4 w-4 items-center justify-center text-obsidian-500">
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
            {isExpanded ? (
              <FolderOpen size={16} className="text-[var(--accent-color)]" />
            ) : (
              <Folder size={16} className="text-obsidian-400" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileText size={16} className={isCurrentFile ? "text-[var(--accent-color)]" : "text-obsidian-400"} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              currentFilePath={currentFilePath}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ nodes, currentFilePath, onFileClick }: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-obsidian-500">
        暂无文件
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          currentFilePath={currentFilePath}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  );
}
