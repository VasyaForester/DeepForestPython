export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error: string;
  kind?: string;
};

type Pending = {
  resolve: (result: RunResult) => void;
  timer: number;
  phase: "load" | "run";
  timeoutMs: number;
};

const LOAD_TIMEOUT_MS = 90000;

export class PythonRuntime {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  status: "idle" | "loading" | "ready" = "idle";

  private ensure() {
    if (this.worker) return;
    this.status = "loading";
    this.worker = new Worker(`${import.meta.env.BASE_URL}pyodide-worker.js`, { type: "module" });
    this.worker.onmessage = (event) => {
      const data = event.data;
      const job = this.pending.get(data.id);
      if (!job) return;
      if (data.phase === "start") {
        window.clearTimeout(job.timer);
        job.phase = "run";
        job.timer = window.setTimeout(() => this.expire(data.id), job.timeoutMs);
        this.status = "ready";
        return;
      }
      window.clearTimeout(job.timer);
      this.pending.delete(data.id);
      this.status = "ready";
      job.resolve({
        ok: Boolean(data.ok),
        stdout: data.stdout || "",
        stderr: data.stderr || "",
        error: data.error || "",
        kind: data.kind,
      });
    };
    this.worker.onerror = (event) => {
      this.failAll(event.message || "Не удалось запустить Python в браузере");
    };
  }

  private expire(id: number) {
    const job = this.pending.get(id);
    if (!job) return;
    this.pending.delete(id);
    const loading = job.phase === "load";
    this.worker?.terminate();
    this.worker = null;
    this.status = "idle";
    job.resolve({
      ok: false,
      stdout: "",
      stderr: "",
      error: loading ? "Python не успел загрузиться. Проверьте интернет и запустите пример ещё раз." : "Превышено время выполнения",
      kind: loading ? "worker_crash" : "sandbox_timeout",
    });
  }

  private failAll(message: string) {
    this.pending.forEach((job) => {
      window.clearTimeout(job.timer);
      job.resolve({ ok: false, stdout: "", stderr: "", error: message, kind: "worker_crash" });
    });
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.status = "idle";
  }

  run(code: string, stdin = "", timeoutMs = 2000, type: "exec" | "repl" = "exec"): Promise<RunResult> {
    this.ensure();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => this.expire(id), LOAD_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer, phase: "load", timeoutMs });
      this.worker?.postMessage({ id, type, code, stdin });
    });
  }
}

export const pythonRuntime = new PythonRuntime();
