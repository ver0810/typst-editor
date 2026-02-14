import { useState } from "react";
import { Pencil, Info, ChevronDown, ChevronUp, AlignLeft, AlignJustify } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface SettingsPanelProps {
  isDark?: boolean;
  theme: "paper" | "midnight";
  onThemeChange: (theme: "paper" | "midnight") => void;
}

export function SettingsPanel({ 
  isDark = true,
  theme,
  onThemeChange
}: SettingsPanelProps) {
  const [fontSize, setFontSize] = useState(13);
  const [lineNumbers, setLineNumbers] = useState("Normal");
  const [showLineNumbersInSearch, setShowLineNumbersInSearch] = useState(true);
  const [writingDirection, setWritingDirection] = useState<"ltr" | "rtl">("ltr");
  const [fontFamily, setFontFamily] = useState('"Cascadia Mono", monospace');
  const [disableCtrlS, setDisableCtrlS] = useState(true);
  const [enableVimMode, setEnableVimMode] = useState(false);
  const [enableSpellchecking, setEnableSpellchecking] = useState(true);

  const containerClass = isDark 
    ? "bg-obsidian-900 text-obsidian-100" 
    : "bg-white text-gray-900";
  
  const sectionTitleClass = isDark
    ? "text-lg font-semibold text-obsidian-100"
    : "text-lg font-semibold text-gray-900";
  
  const labelClass = isDark
    ? "text-sm text-obsidian-300"
    : "text-sm text-gray-700";
  
  const inputClass = isDark
    ? "rounded-md border border-obsidian-600 bg-obsidian-800 px-3 py-2 text-sm text-obsidian-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    : "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const checkboxClass = "h-5 w-5 rounded accent-blue-500 cursor-pointer";

  return (
    <div className={`h-full w-full overflow-y-auto p-6 ${containerClass}`}>
      <div className="mx-auto max-w-xl space-y-6">
        {/* Editor Settings Title */}
        <h2 className={sectionTitleClass}>Editor settings</h2>

        {/* Appearance Theme */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Appearance Theme</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-40 justify-between font-normal"
              >
                {theme === "paper" ? "Paper Light" : "Midnight Deep"}
                <ChevronDown size={16} className="opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onThemeChange("midnight")}>
                Midnight Deep
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onThemeChange("paper")}>
                Paper Light
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Font size */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Font size in the editor</span>
          <div className="relative">
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value) || 13)}
              className={`${inputClass} w-20 text-center pr-6`}
              min={8}
              max={72}
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
              <button
                onClick={() => setFontSize(prev => Math.min(72, prev + 1))}
                className={`p-0.5 hover:text-blue-500 ${isDark ? "text-obsidian-400" : "text-gray-500"}`}
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={() => setFontSize(prev => Math.max(8, prev - 1))}
                className={`p-0.5 hover:text-blue-500 ${isDark ? "text-obsidian-400" : "text-gray-500"}`}
              >
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Line numbers */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Line numbers</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-32 justify-between font-normal"
              >
                {lineNumbers}
                <ChevronDown size={16} className="opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {["Normal", "Relative", "Interval", "Off"].map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => setLineNumbers(option)}
                >
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Show line numbers in search results */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Show line numbers in search results</span>
          <input
            type="checkbox"
            checked={showLineNumbersInSearch}
            onChange={(e) => setShowLineNumbersInSearch(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        {/* Writing direction */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Writing direction</span>
          <div className={`flex rounded-md border overflow-hidden ${isDark ? "border-obsidian-600" : "border-gray-300"}`}>
            <button
              onClick={() => setWritingDirection("ltr")}
              className={`flex items-center justify-center w-10 h-9 transition-colors ${
                writingDirection === "ltr"
                  ? "bg-blue-500 text-white"
                  : isDark
                    ? "bg-obsidian-800 text-obsidian-400 hover:bg-obsidian-700"
                    : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <AlignLeft size={18} />
            </button>
            <button
              onClick={() => setWritingDirection("rtl")}
              className={`flex items-center justify-center w-10 h-9 transition-colors ${
                writingDirection === "rtl"
                  ? "bg-blue-500 text-white"
                  : isDark
                    ? "bg-obsidian-800 text-obsidian-400 hover:bg-obsidian-700"
                    : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <AlignJustify size={18} />
            </button>
          </div>
        </div>

        {/* Font family */}
        <div className="space-y-2">
          <label className={labelClass}>Font family in the editor</label>
          <input
            type="text"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className={`${inputClass} w-full font-mono`}
          />
        </div>

        {/* Disable Ctrl+S */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Disable the browser&apos;s Ctrl-S shortcut</span>
          <input
            type="checkbox"
            checked={disableCtrlS}
            onChange={(e) => setDisableCtrlS(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        {/* Enable Vim Mode */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <span className={labelClass}>Enable Vim Mode</span>
            <p className={`text-xs ${isDark ? "text-obsidian-500" : "text-gray-500"}`}>
              Applies keybindings as known from Vim.
            </p>
          </div>
          <input
            type="checkbox"
            checked={enableVimMode}
            onChange={(e) => setEnableVimMode(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        {/* Spellcheck Section */}
        <div className="pt-4 border-t border-obsidian-700">
          <div className="flex items-center gap-2">
            <h3 className={`text-lg font-semibold ${isDark ? "text-obsidian-100" : "text-gray-900"}`}>
              Spellcheck
            </h3>
            <button className={`${isDark ? "text-obsidian-500 hover:text-obsidian-300" : "text-gray-400 hover:text-gray-600"}`}>
              <Info size={18} />
            </button>
          </div>
        </div>

        {/* Enable spellchecking */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Enable spellchecking</span>
          <input
            type="checkbox"
            checked={enableSpellchecking}
            onChange={(e) => setEnableSpellchecking(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        {/* Personal Dictionary */}
        <div className="flex items-center justify-between">
          <span className={labelClass}>Personal Dictionary</span>
          <button
            className={`flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
              isDark
                ? "border-obsidian-600 bg-obsidian-800 text-obsidian-300 hover:bg-obsidian-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Pencil size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
