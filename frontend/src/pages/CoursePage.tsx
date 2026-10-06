import { Link } from "react-router-dom";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";
import { lessonsLabel } from "../lib/plural";

const data = manifest as Manifest;

export function CoursePage() {
  const planned = data.course.sections.reduce((sum, section) => sum + section.planned_lessons, 0);
  const openLessons = data.lessons.length;
  return (
    <div>
      <p className="eyebrow">Программа</p>
      <h1>Python (бета)</h1>
      <p className="lead">{data.course.tagline}. Без предварительных знаний.</p>
      <p>{data.course.summary}</p>
      <ul className="feature-list">
        <li>
          {lessonsLabel(planned)} в полной программе, открыто {openLessons}
        </li>
        <li>Браузерная IDE, практика и автопроверка</li>
        <li>Дальше в курсе: алгоритмы, SQL, pandas, API, backend, Git</li>
      </ul>
      <p>
        <Link className="button" to="/programs/python/section/basics">
          Начать с основ
        </Link>{" "}
        <Link className="button ghost" to="/programs/python/diagnostic">
          Пройти диагностику
        </Link>
      </p>
      <h2>Структура программы</h2>
      <div className="stack">
        {data.course.sections.map((section) => {
          const ready = data.lessons.filter((lesson) => lesson.section === section.id).length;
          return (
            <article key={section.id} className="card">
              <span className={section.status === "published" ? "pill ok" : "pill lock"}>
                {section.status === "published" ? "Открыт" : "В плане"}
              </span>
              <h3>
                {section.order}. {section.title}
              </h3>
              <p className="muted">{section.summary}</p>
              <p className="muted">
                {section.status === "published"
                  ? `${lessonsLabel(ready)}, написаны и открыты`
                  : `В плане ${lessonsLabel(section.planned_lessons)}`}
              </p>
              {section.status === "published" && (
                <Link to={`/programs/python/section/${section.slug}`}>Открыть раздел</Link>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
