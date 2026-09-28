import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";

const data = manifest as Manifest;

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.search.filter((item) => {
      if (section !== "all" && item.section !== section) return false;
      if (!needle) return true;
      const haystack = `${item.title} ${item.snippet} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, section]);

  return (
    <div>
      <h1>Поиск по курсу</h1>
      <div className="search-row">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="print, переменная, input" aria-label="Поиск" />
        <select value={section} onChange={(event) => setSection(event.target.value)} aria-label="Раздел">
          <option value="all">Все разделы</option>
          {data.course.sections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>
      <div className="stack">
        {results.map((item) => (
          <Link key={item.lesson_id} to={`/programs/python/lesson/${item.slug}`} className="card">
            <h2>{item.title}</h2>
            <p className="muted">{item.snippet}</p>
          </Link>
        ))}
        {results.length === 0 && <p>Ничего не найдено.</p>}
      </div>
    </div>
  );
}

export function ReferencePage() {
  return (
    <div>
      <h1>Справочник</h1>
      <p className="muted">Термины появляются из уроков, где они введены впервые.</p>
      <div className="stack">
        {data.references.map((item) => (
          <article key={item.id} className="card">
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <Link to={`/programs/python/lesson/${item.lesson_slug}`}>{item.lesson_title}</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
