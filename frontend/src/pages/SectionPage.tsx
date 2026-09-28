import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Progress } from "../api";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";
import { lessonStatus } from "../lib/progress";

const data = manifest as Manifest;

export function SectionPage() {
  const { slug = "" } = useParams();
  const section = data.course.sections.find((item) => item.slug === slug);
  const lessons = data.lessons.filter((item) => item.section === section?.id);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    api<Progress>("/api/python/progress").then(setProgress).catch(() => setProgress(null));
  }, []);

  if (!section) return <p>Раздел не найден.</p>;

  return (
    <div>
      <p className="eyebrow">Раздел {section.order}</p>
      <h1>{section.title}</h1>
      <p>{section.summary}</p>
      <div className="stack">
        {lessons.map((lesson) => {
          const status = lessonStatus(progress?.lessons || [], lesson.id);
          return (
            <Link key={lesson.id} to={`/programs/python/lesson/${lesson.slug}`} className="card">
              <span className="pill">{status === "completed" ? "Пройден" : status === "skipped" ? "Пропущен" : "Открыт"}</span>
              <h2>
                {lesson.order}. {lesson.title}
              </h2>
              <p className="muted">{lesson.goal}</p>
            </Link>
          );
        })}
        {lessons.length === 0 && <p className="muted">Уроки этого раздела ещё не опубликованы.</p>}
      </div>
    </div>
  );
}
