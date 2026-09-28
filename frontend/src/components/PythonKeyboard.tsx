const KEYS = ["Tab", "()", "[]", "{}", ":", "=", "==", "!=", "<=", ">=", "+", "-", "*", "/", "//", "%", "**", "_", "#", '"', "'", "\\"];

export function PythonKeyboard({ onInsert, collapsed, onToggle }: { onInsert: (text: string) => void; collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="keyboard">
      <button type="button" className="linkish" onClick={onToggle}>
        {collapsed ? "Показать клавиатуру Python" : "Скрыть клавиатуру"}
      </button>
      {!collapsed && (
        <div className="keys">
          {KEYS.map((key) => (
            <button key={key} type="button" onClick={() => onInsert(key === "Tab" ? "    " : key)}>
              {key}
            </button>
          ))}
          <button type="button" onClick={() => onInsert("\n")}>
            Enter
          </button>
        </div>
      )}
    </div>
  );
}
