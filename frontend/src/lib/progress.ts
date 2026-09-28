import type { LessonState } from "../api";
import type { Lesson } from "../content/types";

export function lessonStatus(records: LessonState[], id: string): string {
  return records.find((item) => item.lesson_id === id)?.status || "not_started";
}

export function prereqsMet(lesson: Lesson, records: LessonState[]): boolean {
  return lesson.prerequisites.every((id) => {
    const status = lessonStatus(records, id);
    return status === "completed" || status === "skipped";
  });
}

export function missingPrereqs(lesson: Lesson, lessons: Lesson[], records: LessonState[]): Lesson[] {
  return lesson.prerequisites
    .filter((id) => {
      const status = lessonStatus(records, id);
      return status !== "completed" && status !== "skipped";
    })
    .map((id) => lessons.find((item) => item.id === id))
    .filter((item): item is Lesson => Boolean(item));
}
