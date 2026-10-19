/** Совпадает с compare_stdout в frontend/public/task_checks.py. */
export function stdoutMatches(actual: string, expected: string, mode = "exact"): boolean {
  if (!mode || mode === "exact") return actual === expected;
  if (mode === "set") {
    const lines = (text: string) => new Set(text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    const left = lines(actual);
    const right = lines(expected);
    if (left.size !== right.size) return false;
    for (const item of left) if (!right.has(item)) return false;
    return true;
  }
  return false;
}
