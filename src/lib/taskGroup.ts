// Shared task-grouping logic. Tasks named "Process name [Role]" (e.g. the
// BA/Dev/QA split of one imported spreadsheet row) cluster together under a
// shared group header instead of scattering by planned date. Plain task
// names (no bracket suffix) are untouched — each is its own ungrouped row.
// Used by TaskTable.tsx and Gantt.tsx so both views order tasks the same way.

export const TASK_ROLE_ORDER: Record<string, number> = { BA: 0, Dev: 1, QA: 2 };

export function taskGroupKey(name: string): { base: string; suffix: string | null } {
  const m = name.match(/^(.*) \[([^[\]]+)\]$/);
  return m ? { base: m[1], suffix: m[2] } : { base: name, suffix: null };
}

export interface GroupedTask<T> {
  t: T;
  base: string;
  suffix: string | null;
}

// Groups order by their earliest task id — i.e. creation/import order, which
// for an import is the original source order (e.g. spreadsheet row order).
// Deliberately not by computed planned date: that reshuffles rows every time
// the schedule recalculates, which is more disorienting than useful here.
export function groupTasks<T extends { id: number; name: string }>(tasks: T[]): GroupedTask<T>[] {
  const withKeys = tasks.map((t) => ({ t, ...taskGroupKey(t.name) }));
  const groupOrder = new Map<string, number>();
  for (const { t, base } of withKeys) {
    if (!groupOrder.has(base) || t.id < groupOrder.get(base)!) groupOrder.set(base, t.id);
  }
  return withKeys.sort((a, b) => {
    const byGroup = groupOrder.get(a.base)! - groupOrder.get(b.base)!;
    if (byGroup !== 0) return byGroup;
    if (a.base !== b.base) return a.base.localeCompare(b.base);
    const ra = a.suffix ? TASK_ROLE_ORDER[a.suffix] ?? 99 : 99;
    const rb = b.suffix ? TASK_ROLE_ORDER[b.suffix] ?? 99 : 99;
    return ra !== rb ? ra - rb : a.t.id - b.t.id;
  });
}
