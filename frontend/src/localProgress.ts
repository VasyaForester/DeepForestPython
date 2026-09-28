import manifest from "./content/manifest.json";
import type { Progress, TaskState, User } from "./api";
import type { Lesson, Manifest, Task } from "./content/types";

const data = manifest as Manifest;
const ACCOUNTS_KEY = "dfa-python-accounts-v1";
const SESSION_KEY = "dfa-python-session-v1";
const ACADEMY_SESSION = "dfa-session-v1";
const ACADEMY_USERS = "dfa-users-v1";

type Account = { email: string; name: string; passwordHash: string; resetToken?: string };
type LessonRow = { lesson_id: string; status: string; grade: number | null };
type DraftRow = { task_id: string; code: string };
type Store = {
  lessons: LessonRow[];
  tasks: TaskState[];
  drafts: DraftRow[];
  certificates: { section_id: string; number: string }[];
  diplomaNumber: string | null;
};

function fail(message: string): never {
  throw new Error(message);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function attemptFactor(attemptNumber: number): number {
  return Math.max(0.7, 1 - 0.025 * (attemptNumber - 1));
}

function hintFactor(hintsUsed: number): number {
  return Math.max(0.85, 1 - 0.03 * Math.max(0, hintsUsed));
}

function taskScore(correctness: number, attemptNumber: number, hintsUsed: number, solutionSeen: boolean): number {
  const bounded = Math.min(1, Math.max(0, correctness));
  const raw = 4 * bounded * attemptFactor(attemptNumber) * hintFactor(hintsUsed) * (solutionSeen ? 0.95 : 1);
  return round2(raw);
}

function weightedAverage(items: [number, number][]): number | null {
  const weight = items.reduce((sum, item) => sum + item[1], 0);
  if (weight <= 0 || items.length === 0) return null;
  const total = items.reduce((sum, [score, itemWeight]) => sum + score * itemWeight, 0);
  return round2(total / weight);
}

function lessons(): Lesson[] {
  return data.lessons;
}

function lessonById(id: string): Lesson | undefined {
  return lessons().find((item) => item.id === id);
}

function taskById(id: string): { lesson: Lesson; task: Task } | undefined {
  for (const lesson of lessons()) {
    const task = lesson.tasks.find((item) => item.id === id);
    if (task) return { lesson, task };
  }
  return undefined;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function academyUser(): User | null {
  const login = localStorage.getItem(ACADEMY_SESSION);
  if (!login) return null;
  const users = readJson<Record<string, { name?: string }>>(ACADEMY_USERS, {});
  const name = users[login]?.name;
  if (!name) return null;
  return { id: 0, name, email: login };
}

function accounts(): Record<string, Account> {
  return readJson<Record<string, Account>>(ACCOUNTS_KEY, {});
}

function saveAccounts(next: Record<string, Account>): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
}

function currentUser(): User | null {
  const academy = academyUser();
  if (academy) return academy;
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;
  const account = accounts()[email];
  if (!account) return null;
  return { id: 0, name: account.name, email: account.email };
}

function progressKey(user: User): string {
  const academy = localStorage.getItem(ACADEMY_SESSION);
  if (academy && user.email === academy) return `dfa-python-progress-v1:academy:${academy}`;
  return `dfa-python-progress-v1:local:${user.email}`;
}

function emptyStore(): Store {
  return { lessons: [], tasks: [], drafts: [], certificates: [], diplomaNumber: null };
}

function loadStore(user: User): Store {
  const store = readJson<Store>(progressKey(user), emptyStore());
  store.lessons ||= [];
  store.tasks ||= [];
  store.drafts ||= [];
  store.certificates ||= [];
  return store;
}

function saveStore(user: User, store: Store): void {
  localStorage.setItem(progressKey(user), JSON.stringify(store));
}

function serial(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return String(hash % 100000).padStart(5, "0");
}

function prereqsOpen(store: Store, lesson: Lesson): boolean {
  return lesson.prerequisites.every((id) => {
    const status = store.lessons.find((item) => item.lesson_id === id)?.status;
    return status === "completed" || status === "skipped";
  });
}

function lessonRow(store: Store, lessonId: string): LessonRow {
  let row = store.lessons.find((item) => item.lesson_id === lessonId);
  if (!row) {
    row = { lesson_id: lessonId, status: "in_progress", grade: null };
    store.lessons.push(row);
  }
  return row;
}

function taskRow(store: Store, taskId: string): TaskState {
  let row = store.tasks.find((item) => item.task_id === taskId);
  if (!row) {
    row = { task_id: taskId, best_score: 0, attempt_count: 0, hints_used: 0, solution_seen: false, passed: false, last_code: "" };
    store.tasks.push(row);
  }
  return row;
}

function lessonGrade(store: Store, lesson: Lesson): number | null {
  const items: [number, number][] = [];
  for (const task of lesson.tasks) {
    const row = store.tasks.find((item) => item.task_id === task.id);
    if (row?.passed) items.push([row.best_score, task.difficulty]);
  }
  return weightedAverage(items);
}

function tasksPassed(store: Store, lesson: Lesson): boolean {
  return lesson.tasks.every((task) => store.tasks.some((row) => row.task_id === task.id && row.passed));
}

function courseGpa(store: Store): number | null {
  const items: [number, number][] = [];
  for (const row of store.lessons) {
    if (row.status !== "completed" || row.grade === null) continue;
    const lesson = lessonById(row.lesson_id);
    if (lesson) items.push([row.grade, lesson.weight]);
  }
  return weightedAverage(items);
}

function payload(store: Store): Progress {
  return { lessons: store.lessons, tasks: store.tasks, drafts: store.drafts, gpa: courseGpa(store) };
}

function requireUser(): User {
  return currentUser() ?? fail("Нужна регистрация");
}

function gradePayload(task: Task, body: Record<string, unknown>): { passed: boolean; testsPassed: number; testsTotal: number } {
  if (task.type === "choice" || task.type === "predict_output") {
    const passed = body.answer === task.answer;
    return { passed, testsPassed: passed ? 1 : 0, testsTotal: 1 };
  }
  const results = Array.isArray(body.results) ? body.results : [];
  const total = task.tests?.length ?? 0;
  if (results.length !== total) return { passed: false, testsPassed: 0, testsTotal: total };
  const testsPassed = results.filter((item) => item && typeof item === "object" && (item as { passed?: boolean }).passed === true).length;
  return { passed: testsPassed === total && total > 0, testsPassed, testsTotal: total };
}

function issueCertificates(user: User, store: Store): void {
  for (const section of data.course.sections.filter((item) => item.status === "published")) {
    const sectionLessons = lessons().filter((lesson) => lesson.section === section.id);
    const ready = sectionLessons.length > 0 && sectionLessons.every((lesson) => store.lessons.some((row) => row.lesson_id === lesson.id && row.status === "completed"));
    if (!ready || store.certificates.some((item) => item.section_id === section.id)) continue;
    store.certificates.push({
      section_id: section.id,
      number: `DFS-${section.id.slice(0, 3).toUpperCase()}-${serial(progressKey(user))}`,
    });
  }
}

async function readBody(options: RequestInit): Promise<Record<string, unknown>> {
  if (typeof options.body !== "string" || !options.body) return {};
  return JSON.parse(options.body) as Record<string, unknown>;
}

function match(path: string, pattern: string): Record<string, string> | null {
  const actual = path.split("/").filter(Boolean);
  const expected = pattern.split("/").filter(Boolean);
  if (actual.length !== expected.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < actual.length; i += 1) {
    if (expected[i].startsWith(":")) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    else if (actual[i] !== expected[i]) return null;
  }
  return params;
}

export async function localApi<T>(rawPath: string, options: RequestInit = {}): Promise<T> {
  const path = rawPath.split("?")[0];
  const method = (options.method || "GET").toUpperCase();
  const body = await readBody(options);

  if (method === "GET" && path === "/api/python/me") {
    return { user: currentUser() } as T;
  }

  if (method === "POST" && path === "/api/python/auth/register") {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (name.length < 2 || !email.includes("@") || password.length < 8) fail("Укажите имя, почту и пароль от 8 символов");
    const next = accounts();
    if (next[email]) fail("Такая почта уже зарегистрирована");
    next[email] = { email, name, passwordHash: await sha256(password) };
    saveAccounts(next);
    localStorage.setItem(SESSION_KEY, email);
    return { user: { id: 0, name, email } } as T;
  }

  if (method === "POST" && path === "/api/python/auth/login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const account = accounts()[email];
    if (!account || account.passwordHash !== (await sha256(password))) fail("Неверная почта или пароль");
    localStorage.setItem(SESSION_KEY, email);
    return { user: { id: 0, name: account.name, email } } as T;
  }

  if (method === "POST" && path === "/api/python/auth/logout") {
    localStorage.removeItem(SESSION_KEY);
    return { ok: true } as T;
  }

  if (method === "POST" && path === "/api/python/auth/password-reset/request") {
    const email = String(body.email || "").trim().toLowerCase();
    const next = accounts();
    const account = next[email];
    if (!account) return { ok: true, message: "Если почта зарегистрирована, создан код сброса." } as T;
    account.resetToken = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
    saveAccounts(next);
    return { ok: true, dev_token: account.resetToken, message: "Если почта зарегистрирована, создан код сброса." } as T;
  }

  if (method === "POST" && path === "/api/python/auth/password-reset/confirm") {
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (password.length < 8) fail("Пароль должен быть не короче 8 символов");
    const next = accounts();
    const account = Object.values(next).find((item) => item.resetToken === token);
    if (!account) fail("Код сброса не найден");
    account.passwordHash = await sha256(password);
    delete account.resetToken;
    saveAccounts(next);
    return { ok: true } as T;
  }

  if (method === "POST" && path === "/api/python/security-event") return { ok: true } as T;

  if (method === "POST" && path === "/api/python/diagnostic") {
    const answers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, number>;
    let correct = 0;
    const misses: string[] = [];
    for (const question of data.diagnostic.questions) {
      if (answers[question.id] === question.answer) correct += 1;
      else misses.push(question.suggests);
    }
    const suggested = misses[0] || data.diagnostic.questions.at(-1)?.suggests || "";
    return { correct, total: data.diagnostic.questions.length, suggested_lesson_id: suggested } as T;
  }

  const user = method === "GET" && path === "/api/python/health" ? null : requireUser();
  if (path === "/api/python/health") return { ok: true } as T;
  if (!user) fail("Нужна регистрация");
  const store = loadStore(user);

  if (method === "GET" && path === "/api/python/progress") return payload(store) as T;

  const lessonPut = match(path, "/api/python/progress/lesson/:lessonId");
  if (method === "PUT" && lessonPut) {
    const lesson = lessonById(lessonPut.lessonId) ?? fail("Урок не найден");
    const status = String(body.status || "");
    if (!["in_progress", "skipped", "completed"].includes(status)) fail("Неизвестный статус");
    if (!prereqsOpen(store, lesson)) fail("Сначала завершите или пропустите предыдущие темы");
    if (status === "completed" && !tasksPassed(store, lesson)) fail("Сначала решите все задания урока");
    const row = lessonRow(store, lesson.id);
    row.status = status;
    if (status === "completed") row.grade = lessonGrade(store, lesson);
    if (status === "skipped") row.grade = null;
    saveStore(user, store);
    return payload(store) as T;
  }

  const draft = match(path, "/api/python/task/:taskId/draft");
  if (method === "PUT" && draft) {
    if (!taskById(draft.taskId)) fail("Задание не найдено");
    const code = String(body.code || "").slice(0, 20000);
    const row = store.drafts.find((item) => item.task_id === draft.taskId);
    if (row) row.code = code;
    else store.drafts.push({ task_id: draft.taskId, code });
    saveStore(user, store);
    return { ok: true } as T;
  }

  const hint = match(path, "/api/python/task/:taskId/hint");
  if (method === "POST" && hint) {
    if (!taskById(hint.taskId)) fail("Задание не найдено");
    const row = taskRow(store, hint.taskId);
    if (row.hints_used >= 3) fail("Подсказки закончились");
    row.hints_used += 1;
    saveStore(user, store);
    return { hints_used: row.hints_used } as T;
  }

  const solution = match(path, "/api/python/task/:taskId/solution");
  if (method === "POST" && solution) {
    if (!taskById(solution.taskId)) fail("Задание не найдено");
    const row = taskRow(store, solution.taskId);
    if (row.attempt_count < 3 && !row.passed) fail("Решение откроется после трёх неудачных попыток");
    row.solution_seen = true;
    saveStore(user, store);
    return { solution_seen: true } as T;
  }

  const attempt = match(path, "/api/python/task/:taskId/attempt");
  if (method === "POST" && attempt) {
    const found = taskById(attempt.taskId) ?? fail("Задание не найдено");
    if (!prereqsOpen(store, found.lesson)) fail("Задания этой темы пока закрыты");
    const row = taskRow(store, attempt.taskId);
    row.attempt_count += 1;
    const graded = gradePayload(found.task, body);
    const code = String(body.code || "").slice(0, 20000);
    const score = taskScore(graded.passed ? 1 : 0, row.attempt_count, row.hints_used, row.solution_seen);
    if (graded.passed) {
      row.passed = true;
      row.best_score = Math.max(row.best_score, score);
    }
    row.last_code = code;
    const lesson = lessonRow(store, found.lesson.id);
    if (tasksPassed(store, found.lesson)) {
      lesson.status = "completed";
      lesson.grade = lessonGrade(store, found.lesson);
    }
    saveStore(user, store);
    return { passed: graded.passed, score: graded.passed ? score : 0, attempt_count: row.attempt_count, ...payload(store) } as T;
  }

  if (method === "GET" && path === "/api/python/certificates") {
    issueCertificates(user, store);
    saveStore(user, store);
    return { certificates: store.certificates } as T;
  }

  if (method === "GET" && path === "/api/python/diploma") {
    issueCertificates(user, store);
    const published = data.course.sections.filter((item) => item.status === "published");
    const ready = published.every((section) => store.certificates.some((item) => item.section_id === section.id));
    if (ready && !store.diplomaNumber) store.diplomaNumber = `DFP-${serial(progressKey(user))}`;
    saveStore(user, store);
    return {
      ready,
      diploma: store.diplomaNumber ? { number: store.diplomaNumber } : null,
      gpa: courseGpa(store),
      name: user.name,
    } as T;
  }

  fail("Запрос не выполнен");
}
