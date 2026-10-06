export function plural(count: number, one: string, few: string, many: string): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function lessonsLabel(count: number): string {
  return `${count} ${plural(count, "урок", "урока", "уроков")}`;
}
