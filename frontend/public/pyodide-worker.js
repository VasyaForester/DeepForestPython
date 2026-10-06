import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";

const GUARD = `
import builtins

def _install_guard():
    real_import = builtins.__import__
    banned = {"os", "subprocess", "socket", "ctypes", "js", "shutil", "multiprocessing", "asyncio", "webbrowser"}

    def guard(name, globals=None, locals=None, fromlist=(), level=0):
        root = name.split(".")[0]
        if root in banned:
            raise ImportError("Модуль " + root + " в учебной среде недоступен")
        return real_import(name, globals, locals, fromlist, level)

    builtins.__import__ = guard

_install_guard()
del _install_guard
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
    const target =
      mode === "repl"
        ? `exec(compile(_user_code, "<repl>", "single"), builtins._repl_ns, builtins._repl_ns)`
        : `exec(compile(_user_code, "main.py", "exec"), {"__name__": "__main__"})`;
    // Ошибку ученика ловим внутри Python: только так в сообщение попадает
    // настоящий текст исключения и номер строки, а не общее PythonError.
    const runner = `
import sys, traceback
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
sys.stdin = StringIO(_stdin_text)
_run_error = ""
try:
    ${target}
except SyntaxError as exc:
    _run_error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
except BaseException as exc:
    _run_error = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__.tb_next)).strip()
`;
    await pyodide.runPythonAsync(runner);
    const stdout = pyodide.runPython("sys.stdout.getvalue()");
    const stderr = pyodide.runPython("sys.stderr.getvalue()");
    const runError = pyodide.runPython("_run_error");
    if (runError) {
      const kind = runError.includes("недоступен") ? "blocked_import" : "python_error";
      self.postMessage({ id: msg.id, ok: false, stdout, stderr, error: runError, kind });
      return;
    }
    self.postMessage({ id: msg.id, ok: true, stdout, stderr });
  } catch (error) {
    const text = String(error && error.message ? error.message : error);
    const kind = text.includes("недоступен") ? "blocked_import" : "worker_error";
    self.postMessage({ id: msg.id, ok: false, error: text, kind });
  }
};
