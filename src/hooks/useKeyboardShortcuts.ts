import { useEffect, useCallback } from "react";

interface KeyboardShortcutsOptions {
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveFile?: () => void;
  onSaveAs?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  const { onNewFile, onOpenFile, onSaveFile, onSaveAs } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (!isCtrlOrCmd) return;

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault();
          onNewFile?.();
          break;
        case "o":
          event.preventDefault();
          onOpenFile?.();
          break;
        case "s":
          event.preventDefault();
          if (event.shiftKey) {
            onSaveAs?.();
          } else {
            onSaveFile?.();
          }
          break;
      }
    },
    [onNewFile, onOpenFile, onSaveFile, onSaveAs]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
