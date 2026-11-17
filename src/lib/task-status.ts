export const taskStatuses = [
  { value: "todo", label: "Te doen" },
  { value: "doing", label: "Bezig" },
  { value: "waiting", label: "Wachten" },
  { value: "review", label: "Review" },
  { value: "done", label: "Afgerond" },
  { value: "cancelled", label: "Geannuleerd" },
];

const labels: Record<string, string> = Object.fromEntries(
  taskStatuses.map(({ value, label }) => [value, label]),
);

export function taskStatusLabel(status: string): string {
  return labels[status] ?? status;
}
