import { localApi } from "./localProgress";

let backend: Promise<boolean> | null = null;

function hasBackend(): Promise<boolean> {
  if (!backend) {
    backend = (async () => {
      try {
        const response = await fetch("/api/python/health", { credentials: "include" });
        const type = response.headers.get("content-type") || "";
        return response.ok && type.includes("json");
      } catch {
        return false;
      }
    })();
  }
  return backend;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!(await hasBackend())) return localApi<T>(path, options);
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Запрос не выполнен");
  }
  return data as T;
}

export type User = { id: number; name: string; email: string };

export type LessonState = { lesson_id: string; status: string; grade: number | null };

export type TaskState = {
  task_id: string;
  best_score: number;
  attempt_count: number;
  hints_used: number;
  solution_seen: boolean;
  passed: boolean;
  last_code: string;
};

export type Progress = {
  lessons: LessonState[];
  tasks: TaskState[];
  drafts: { task_id: string; code: string }[];
  gpa: number | null;
};
