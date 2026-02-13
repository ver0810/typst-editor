import { Extension } from "@codemirror/state";
import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { invoke } from "@tauri-apps/api/core";

const DOCUMENT_URI = "file:///workspace/main.typ";

interface TypstCompletionItem {
  label: string;
  insertText?: string;
  kind?: number;
  detail?: string;
}

interface TypstHover {
  contents: unknown;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

interface TypstLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

let documentVersion = 1;

export function typstLsp(): Extension {
  return [];
}

export async function updateDocument(content: string): Promise<void> {
  try {
    await invoke("lsp_update_document", {
      uri: DOCUMENT_URI,
      content,
      version: documentVersion,
    });
    documentVersion++;
  } catch (error) {
    console.warn("Failed to update LSP document:", error);
  }
}

export async function getCompletion(
  line: number,
  character: number
): Promise<TypstCompletionItem[]> {
  try {
    const result = await invoke<TypstCompletionItem[]>("lsp_completion", {
      uri: DOCUMENT_URI,
      line: line - 1,
      character,
      version: documentVersion,
    });
    return result || [];
  } catch (error) {
    console.warn("Completion request failed:", error);
    return [];
  }
}

export async function getHover(
  line: number,
  character: number
): Promise<TypstHover | null> {
  try {
    const result = await invoke<TypstHover | null>("lsp_hover", {
      uri: DOCUMENT_URI,
      line: line - 1,
      character,
      version: documentVersion,
    });
    return result;
  } catch (error) {
    console.warn("Hover request failed:", error);
    return null;
  }
}

export async function gotoDefinition(
  line: number,
  character: number
): Promise<TypstLocation | null> {
  try {
    const result = await invoke<TypstLocation | null>("lsp_goto_definition", {
      uri: DOCUMENT_URI,
      line: line - 1,
      character,
      version: documentVersion,
    });
    return result;
  } catch (error) {
    console.warn("Goto definition request failed:", error);
    return null;
  }
}

export function typstCompletion(context: CompletionContext): Promise<CompletionResult | null> {
  const line = context.state.doc.lineAt(context.pos);
  const lineNumber = line.number;
  const column = context.pos - line.from;

  return getCompletion(lineNumber, column).then((items) => {
    if (items.length === 0) {
      return null;
    }

    return {
      from: context.pos,
      options: items.map((item) => ({
        label: item.label,
        apply: item.insertText || item.label,
        detail: item.detail,
        kind: item.kind ? mapKind(item.kind) : undefined,
      })),
    };
  });
}

function mapKind(kind: number): number {
  const kindMap: Record<number, number> = {
    1: 0,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 7,
    9: 8,
    10: 9,
    11: 10,
    12: 11,
    13: 12,
    14: 13,
    15: 14,
    16: 15,
    17: 16,
    18: 17,
    19: 18,
    20: 19,
    21: 20,
    22: 21,
  };
  return kindMap[kind] ?? 1;
}
