import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Progress, type User } from "../api";
import { CodeEditor, insertIntoEditor } from "../components/CodeEditor";
import { PythonKeyboard } from "../components/PythonKeyboard";
import manifest from "../content/manifest.json";
import type { Lesson, Manifest, Task } from "../content/types";
import { formatGpa } from "../lib/grading";
import { lessonStatus, missingPrereqs, prereqsMet } from "../lib/progress";
import { pythonRuntime, type RunResult } from "../runtime/pythonRuntime";

const data = manifest as Manifest;

export function LessonPage() {
  const { slug = "" } = useParams();
  const lesson = data.lessons.find((item) => item.slug === slug);
  const [user, setUser] = useState<User | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [taskId, setTaskId] = useState(lesson?.tasks[0]?.id || "");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [message, setMessage] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [exampleOutput, setExampleOutput] = useState<Record<string, string>>({});
  const [runningExample, setRunningExample] = useState("");
  const [replInput, setReplInput] = useState("");
  const [replLog, setReplLog] = useState("Python загрузится при первом запуске.\n");

  useEffect(() => {
    setTaskId(lesson?.tasks[0]?.id || "");
  }, [lesson?.id]);

  useEffect(() => {
    api<{ user: User | null }>("/api/python/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
    api<Progress>("/api/python/progress")
      .then(setProgress)
      .catch(() => setProgress(null));
  }, []);

  const task = lesson?.tasks.find((item) => item.id === taskId);
  const saved = progress?.tasks.find((item) => item.task_id === task?.id);
  const draft = progress?.drafts.find((item) => item.task_id === task?.id)?.code;

  useEffect(() => {
    if (!task) return;
    setCode(draft || saved?.last_code || task.starter_code || "");
  }, [task?.id, draft, saved?.last_code, task?.starter_code]);

  useEffect(() => {
    setAnswer("");
    setOutput("");
    setMessage("");
  }, [task?.id]);

  useEffect(() => {
    if (!user || !task || task.type !== "code") return;
    const handle = window.setTimeout(() => {
      api(`/api/python/task/${task.id}/draft`, { method: "PUT", body: JSON.stringify({ code }) }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(handle);
  }, [code, task?.id, user]);

  if (!lesson || !task) return <p>Урок не найден.</p>;

  const records = progress?.lessons || [];
  const open = prereqsMet(lesson, records);
  const missing = missingPrereqs(lesson, data.lessons, records);
  const status = lessonStatus(records, lesson.id);

  async function runExample(title: string, exampleCode: string, stdin = "") {
    setRunningExample(title);
    setExampleOutput((prev) => ({ ...prev, [title]: "Загружается Python. При первом запуске это занимает немного времени." }));
    const result = await pythonRuntime.run(exampleCode, stdin);
    reportRuntime(result);
    setExampleOutput((prev) => ({ ...prev, [title]: formatRun(result) }));
    setRunningExample("");
  }

  function reportRuntime(result: RunResult) {
    if (result.kind === "sandbox_timeout" || result.kind === "blocked_import" || result.kind === "worker_crash") {
      api("/api/python/security-event", { method: "POST", body: JSON.stringify({ kind: result.kind, detail: lesson?.id }) }).catch(() => undefined);
    }
  }

  async function check() {
    if (!task) return;
    if (!open) {
      setMessage("Сначала завершите или пропустите предыдущие темы.");
      return;
    }
    if (task.type === "code") {
      setOutput("Проверка…");
      const results = [];
      for (const test of task.tests || []) {
        const result = await pythonRuntime.run(code, test.stdin || "");
        reportRuntime(result);
        const actual = result.ok ? result.stdout : "";
        results.push({ passed: result.ok && actual === test.expected_stdout, expected: test.expected_stdout, actual: result.ok ? actual : result.error, stdin: test.stdin });
      }
      const report = results.map((item, index) => `${item.passed ? "✓" : "✗"} Тест ${index + 1}\nОжидалось: ${JSON.stringify(item.expected)}\nПолучено: ${JSON.stringify(item.actual)}`).join("\n\n");
      setOutput(report);
      const passed = results.every((item) => item.passed);
      if (!user) {
        setMessage(passed ? "Все тесты пройдены. Войдите, чтобы оценка сохранилась." : "Есть непройденные тесты.");
        return;
      }
      const response = await api<Progress & { passed: boolean; score: number }>(`/api/python/task/${task.id}/attempt`, {
        method: "POST",
        body: JSON.stringify({ code, results: results.map((item) => ({ passed: item.passed })) }),
      });
      setProgress(response);
      setMessage(response.passed ? `Задание принято. Оценка ${formatGpa(response.score)}` : "Есть непройденные тесты.");
      return;
    }
    if (!answer) {
      setMessage("Сначала выберите ответ.");
      return;
    }
    const passed = answer === task.answer;
    if (!user) {
      setMessage(passed ? "Верно. Войдите, чтобы оценка сохранилась." : "Пока неверно.");
      return;
    }
    const response = await api<Progress & { passed: boolean; score: number }>(`/api/python/task/${task.id}/attempt`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    });
    setProgress(response);
    setMessage(response.passed ? `Верно. Оценка ${formatGpa(response.score)}` : "Пока неверно.");
  }

  async function hint() {
    if (!task) return;
    const response = await api<{ hints_used: number }>(`/api/python/task/${task.id}/hint`, { method: "POST" });
    const next = await api<Progress>("/api/python/progress");
    setProgress(next);
    setMessage(task.hints[response.hints_used - 1] || "");
  }

  async function solution() {
    if (!task) return;
    await api(`/api/python/task/${task.id}/solution`, { method: "POST" });
    const next = await api<Progress>("/api/python/progress");
    setProgress(next);
  }

  async function skip() {
    if (!lesson) return;
    const next = await api<Progress>(`/api/python/progress/lesson/${lesson.id}`, { method: "PUT", body: JSON.stringify({ status: "skipped" }) });
    setProgress(next);
  }

  async function repl() {
    const line = replInput;
    setReplInput("");
    setReplLog((prev) => `${prev}>>> ${line}\n`);
    const result = await pythonRuntime.run(line, "", 2000, "repl");
    reportRuntime(result);
    setReplLog((prev) => `${prev}${result.ok ? result.stdout : result.error}\n`);
  }

  const hintsUsed = saved?.hints_used || 0;

  return (
    <article className="lesson">
      <p className="eyebrow">Урок {lesson.order}</p>
      <h1>{lesson.title}</h1>
      <section>
        <h2>Цель</h2>
        <p>{lesson.goal}</p>
      </section>
      <section>
        <h2>Теория</h2>
        {lesson.theory.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
      <section>
        <h2>Примеры</h2>
        {lesson.examples.map((example) => (
          <div key={example.title} className="example">
            <h3>{example.title}</h3>
            <pre>{example.code}</pre>
            <button type="button" onClick={() => runExample(example.title, example.code, example.stdin)} disabled={runningExample === example.title}>
              {runningExample === example.title ? "Запуск…" : "Запустить пример"}
            </button>
            {exampleOutput[example.title] && <pre className="output">{exampleOutput[example.title]}</pre>}
            <p>{example.explanation}</p>
          </div>
        ))}
      </section>
      <section>
        <h2>Практика</h2>
        {!user && (
          <p>
            Задания можно решать сразу. <Link to="/programs/python/profile">Войдите</Link>, чтобы сохранить оценку.
          </p>
        )}
        {user && !open && (
          <div className="card">
            <p>Задания пока недоступны. Сначала завершите или пропустите:</p>
            <ul>
              {missing.map((item) => (
                <li key={item.id}>
                  <Link to={`/programs/python/lesson/${item.slug}`}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="task-layout">
          <div>
            {lesson.tasks.map((item, index) => (
              <button key={item.id} type="button" className={item.id === task.id ? "task-link on" : "task-link"} onClick={() => setTaskId(item.id)}>
                {index + 1}. {item.title}
                {progress?.tasks.find((row) => row.task_id === item.id)?.passed ? " ✓" : ""}
              </button>
            ))}
          </div>
          <div className="task-main">
            <TaskBody task={task} code={code} setCode={setCode} answer={answer} setAnswer={setAnswer} locked={!open} />
            {open && (
              <div className="actions">
                <button type="button" onClick={check}>
                  Проверить
                </button>
                <button type="button" className="ghost" onClick={hint} disabled={!user || hintsUsed >= 3}>
                  Подсказка
                </button>
                <button type="button" className="ghost" onClick={solution} disabled={!user || !saved || (saved.attempt_count < 3 && !saved.passed)}>
                  Решение
                </button>
                {user && status !== "completed" && (
                  <button type="button" className="ghost" onClick={skip}>
                    Пропустить тему
                  </button>
                )}
              </div>
            )}
            {message && <p className="message">{message}</p>}
            {output && <pre className="output">{output}</pre>}
            {hintsUsed > 0 && (
              <ul>
                {task.hints.slice(0, hintsUsed).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {saved?.solution_seen && (
              <div className="card">
                <h3>Разбор</h3>
                <pre>{task.solution}</pre>
                <p>{task.explanation}</p>
              </div>
            )}
          </div>
        </div>
        <PythonKeyboard collapsed={!keyboardOpen} onToggle={() => setKeyboardOpen((value) => !value)} onInsert={insertIntoEditor} />
      </section>
      <section>
        <h2>Консоль</h2>
        <pre className="output">{replLog}</pre>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void repl();
          }}
        >
          <input value={replInput} onChange={(event) => setReplInput(event.target.value)} placeholder="2 + 2" aria-label="Команда Python" />
          <button type="submit">Выполнить</button>
        </form>
      </section>
      <section>
        <h2>Итог</h2>
        <p>После урока вы умеете:</p>
        <ul>
          {lesson.outcomes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Ресурсы</h2>
        <ul>
          {lesson.resources.map((item) => (
            <li key={item.url}>
              {item.kind === "youtube" ? "YouTube" : "Документация"}:{" "}
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              {item.author ? ` · ${item.author}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <LessonNav lesson={lesson} />
    </article>
  );
}

function TaskBody({ task, code, setCode, answer, setAnswer, locked }: { task: Task; code: string; setCode: (value: string) => void; answer: string; setAnswer: (value: string) => void; locked: boolean }) {
  const context = useMemo(() => ({ neutral: "общий", development: "разработка", analytics: "аналитика", security: "безопасность", business: "бизнес" })[task.context] || task.context, [task.context]);
  return (
    <div className="card">
      <p className="muted">
        Сложность {task.difficulty} · {context}
      </p>
      <h3>{task.title}</h3>
      <p>{task.prompt}</p>
      {task.code && <pre>{task.code}</pre>}
      {task.options &&
        task.options.map((option) => (
          <button key={option.id} type="button" className={answer === option.id ? "option on" : "option"} disabled={locked} onClick={() => setAnswer(option.id)}>
            {option.text}
          </button>
        ))}
      {task.type === "code" && <CodeEditor value={code} onChange={setCode} />}
      {locked && <p className="muted">Проверка откроется после предыдущих тем. Код и ответы можно смотреть уже сейчас.</p>}
    </div>
  );
}

function LessonNav({ lesson }: { lesson: Lesson }) {
  const index = data.lessons.findIndex((item) => item.id === lesson.id);
  const prev = data.lessons[index - 1];
  const next = data.lessons[index + 1];
  return (
    <p className="pager">
      {prev && <Link to={`/programs/python/lesson/${prev.slug}`}>← {prev.title}</Link>}
      {next && <Link to={`/programs/python/lesson/${next.slug}`}>{next.title} →</Link>}
    </p>
  );
}

function formatRun(result: RunResult): string {
  if (!result.ok) return result.error;
  return result.stdout || "(без вывода)";
}
