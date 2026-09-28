export function letterFromGrade(grade: number): string {
  if (grade >= 3.7) return "A";
  if (grade >= 2.7) return "B";
  if (grade >= 1.7) return "C";
  if (grade >= 0.7) return "D";
  return "F";
}

export function formatGpa(gpa: number): string {
  return gpa.toFixed(1);
}
