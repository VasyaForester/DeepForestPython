export type Task = {
  id: string;
  type: "choice" | "predict_output" | "code";
  title: string;
  difficulty: number;
  context: string;
  prompt: string;
  code?: string;
  options?: { id: string; text: string }[];
  answer?: string;
  starter_code?: string;
  tests?: { stdin: string; expected_stdout: string }[];
  hints: string[];
  solution: string;
  explanation: string;
};

export type Lesson = {
  id: string;
  slug: string;
  section: string;
  title: string;
  order: number;
  weight: number;
  prerequisites: string[];
  goal: string;
  tags: string[];
  theory: string[];
  examples: { title: string; code: string; explanation: string; stdin?: string }[];
  outcomes: string[];
  resources: { kind: string; title: string; url: string; author?: string }[];
  tasks: Task[];
  introduces?: { id: string; title: string; summary: string }[];
};

export type Section = {
  id: string;
  slug: string;
  order: number;
  title: string;
  status: "published" | "planned";
  summary: string;
};

export type Manifest = {
  course: { id: string; title: string; tagline: string; summary: string; sections: Section[] };
  lessons: Lesson[];
  diagnostic: {
    title: string;
    summary: string;
    questions: { id: string; prompt: string; options: string[]; answer: number; suggests: string }[];
  };
  references: { id: string; title: string; summary: string; lesson_slug: string; lesson_title: string }[];
  search: { lesson_id: string; slug: string; title: string; section: string; tags: string[]; snippet: string }[];
};
