import { FileText, X, Clock } from "lucide-react";

interface RecentFilesListProps {
  files: string[];
  onFileClick: (path: string) => void;
  onRemoveFile: (path: string) => void;
}

export function RecentFilesList({ files, onFileClick, onRemoveFile }: RecentFilesListProps) {
  if (files.length === 0) {
    return (
      <div className="px-4 py-4 text-center">
        <Clock size={24} className="mx-auto mb-2 text-obsidian-500" />
        <p className="text-xs text-obsidian-500">暂无最近打开的文件</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {files.map((filePath) => (
        <RecentFileItem
          key={filePath}
          filePath={filePath}
          onClick={() => onFileClick(filePath)}
          onRemove={(e) => {
            e.stopPropagation();
            onRemoveFile(filePath);
          }}
        />
      ))}
    </div>
  );
}

function RecentFileItem({
  filePath,
  onClick,
  onRemove,
}: {
  filePath: string;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  // 从路径中提取文件名
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  // 提取目录名
  const dirName = filePath.split(/[/\\]/).slice(-2, -1)[0] || "";

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-obsidian-750"
      onClick={onClick}
      title={filePath}
    >
      <FileText size={16} className="flex-shrink-0 text-obsidian-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-obsidian-300">{fileName}</div>
        {dirName && (
          <div className="truncate text-xs text-obsidian-500">{dirName}</div>
        )}
      </div>
      <button
        className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-obsidian-700 group-hover:opacity-100"
        onClick={onRemove}
        title="从列表中移除"
      >
        <X size={14} className="text-obsidian-400" />
      </button>
    </div>
  );
}
