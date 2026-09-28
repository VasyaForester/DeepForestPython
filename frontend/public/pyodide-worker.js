import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";

const GUARD = `
import builtins
_real_import = builtins.__import__
BANNED = {"os", "subprocess", "socket", "ctypes", "js", "shutil", "multiprocessing", "asyncio", "webbrowser"}

def _guard(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split(".")[0]
    if root in BANNED:
        raise ImportError("Модуль " + root + " в учебной среде недоступен")
    return _real_import(name, globals, locals, fromlist, level)

builtins.__import__ = _guard
`;

let pyodidePromise = null;
let replReady = false;

function boot() {
  if (!pyodidePromise) {
    pyodidePromise = loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/",
    }).then(async (pyodide) => {
      await pyodide.runPythonAsync(GUARD);
      return pyodide;
    });
  }
  return pyodidePromise;
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    const pyodide = await boot();
    if (msg.type === "ping") {
      self.postMessage({ id: msg.id, ok: true, ready: true });
      return;
    }
    pyodide.globals.set("_stdin_text", msg.stdin || "");
    pyodide.globals.set("_user_code", msg.code || "");
    const mode = msg.type === "repl" ? "repl" : "exec";
    self.postMessage({ id: msg.id, phase: "start" });
    if (mode === "repl" && !replReady) {
      await pyodide.runPythonAsync(`import builtins\nbuiltins._repl_ns = {"__name__": "__main__"}\n`);
      replReady = true;
    }
    const runner =
      mode === "repl"
        ? `
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
sys.stdin = StringIO(_stdin_text)
code = compile(_user_code, "<repl>", "single")
exec(code, builtins._repl_ns, builtins._repl_ns)
`
        : `
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
sys.stdin = StringIO(_stdin_text)
namespace = {"__name__": "__main__"}
exec(compile(_user_code, "main.py", "exec"), namespace, namespace)
`;
    await pyodide.runPythonAsync(runner);
    const stdout = pyodide.runPython("sys.stdout.getvalue()");
    const stderr = pyodide.runPython("sys.stderr.getvalue()");
    self.postMessage({ id: msg.id, ok: true, stdout, stderr });
  } catch (error) {
    const text = String(error && error.message ? error.message : error);
    const kind = text.includes("недоступен") ? "blocked_import" : "worker_error";
    self.postMessage({ id: msg.id, ok: false, error: text, kind });
  }
};
