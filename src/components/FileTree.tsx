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
        className={`flex cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-sm transition-colors ${
          isCurrentFile
            ? "bg-indigo-500/20 text-indigo-300"
            : "text-obsidian-300 hover:bg-obsidian-750 hover:text-obsidian-200"
        } shadow-sm`}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            <span className="flex h-4 w-4 items-center justify-center text-obsidian-400">
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
            {isExpanded ? (
              <FolderOpen size={16} className="text-indigo-400" />
            ) : (
              <Folder size={16} className="text-indigo-400" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileText size={16} className="text-obsidian-400" />
          </>
        )}
        <span className="ml-1 truncate">{node.name}</span>
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
