import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";

const data = manifest as Manifest;

export function DiagnosticPage() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ correct: number; total: number; suggested_lesson_id: string } | null>(null);

  async function finish() {
    const response = await api<{ correct: number; total: number; suggested_lesson_id: string }>("/api/python/diagnostic", {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    setResult(response);
  }

  const suggested = data.lessons.find((item) => item.id === result?.suggested_lesson_id);

  return (
    <div>
      <h1>{data.diagnostic.title}</h1>
      <p>{data.diagnostic.summary}</p>
      {data.diagnostic.questions.map((question) => (
        <fieldset key={question.id} className="card">
          <legend>{question.prompt}</legend>
          {question.options.map((option, index) => (
            <label key={option} className="option">
              <input type="radio" name={question.id} onChange={() => setAnswers({ ...answers, [question.id]: index })} /> {option}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="button" onClick={finish}>
        Показать ориентир
      </button>
      {result && suggested && (
        <div className="card">
          <p>
            Верно {result.correct} из {result.total}. Это не оценка и ничего не пропускает.
          </p>
          <p>
            Рекомендуется начать с урока <Link to={`/programs/python/lesson/${suggested.slug}`}>{suggested.title}</Link>. Пропуск темы остаётся вашим решением.
          </p>
        </div>
      )}
    </div>
  );
}
