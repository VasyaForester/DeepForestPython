import Editor, { type OnMount } from "@monaco-editor/react";

let activeEditor: Parameters<OnMount>[0] | null = null;

export function insertIntoEditor(text: string) {
  activeEditor?.focus();
  activeEditor?.trigger("keyboard", "type", { text });
}

export function CodeEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="editor-wrap">
      <Editor
        height="240px"
        language="python"
        theme="vs"
        value={value}
        onChange={(next) => onChange(next ?? "")}
        onMount={(editor) => {
          activeEditor = editor;
        }}
        options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 4, scrollBeyondLastLine: false }}
      />
    </div>
  );
}
