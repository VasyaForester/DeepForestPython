import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Progress } from "../api";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";
import { lessonsLabel } from "../lib/plural";
import { lessonStatus, prereqsMet } from "../lib/progress";

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
      <p className="muted">{lessonsLabel(lessons.length)} в разделе. Последний урок собирает темы раздела вместе.</p>
      <div className="stack">
        {lessons.map((lesson) => {
          const records = progress?.lessons || [];
          const status = lessonStatus(records, lesson.id);
          const open = !progress || prereqsMet(lesson, records);
          const label = status === "completed" ? "Пройден" : status === "skipped" ? "Пропущен" : open ? "Открыт" : "Закрыт";
          const pill = status === "completed" ? "pill ok" : !open && status !== "skipped" ? "pill lock" : "pill";
          return (
            <Link key={lesson.id} to={`/programs/python/lesson/${lesson.slug}`} className="card">
              <span className={pill}>{label}</span>
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
