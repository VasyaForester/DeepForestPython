import { Link } from "react-router-dom";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";

const data = manifest as Manifest;

export function CoursePage() {
  return (
    <div>
      <p className="eyebrow">Программа</p>
      <h1>Python (beta)</h1>
      <p className="lead">{data.course.tagline}. Без предварительных знаний.</p>
      <p>{data.course.summary}</p>
      <ul className="feature-list">
        <li>200+ уроков в полной программе, сейчас открыты первые три</li>
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
        {data.course.sections.map((section) => (
          <article key={section.id} className="card">
            <span className={section.status === "published" ? "pill ok" : "pill lock"}>
              {section.status === "published" ? "Открыт" : "В плане"}
            </span>
            <h3>
              {section.order}. {section.title}
            </h3>
            <p className="muted">{section.summary}</p>
            {section.status === "published" && (
              <Link to={`/programs/python/section/${section.slug}`}>Открыть раздел</Link>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
