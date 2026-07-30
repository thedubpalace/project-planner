// Shared task-grouping logic. A group is a real task_groups row (see db.ts) —
// tasks reference one by groupId, with the group's name/sortOrder denormalized
// onto each task so this module never needs a second fetch. Grouped tasks
// cluster under a shared header instead of scattering by planned date;
// ungrouped tasks (groupId null) are each their own standalone row.
// Used by TaskTable.tsx, Gantt.tsx, and PortfolioGantt.tsx so every view
// orders tasks the same way.

export interface GroupedTask<T> {
  t: T;
  base: string; // group name (or the task's own name when standalone)
  suffix: string | null; // the task's own name when grouped, else null
  groupId: number | null;
}

type Groupable = {
  id: number;
  name: string;
  sortOrder?: number;
  groupId?: number | null;
  groupName?: string | null;
  groupSortOrder?: number | null;
};

// Groups order by their own sort_order; standalone tasks order by their own
// sort_order — both numbers live in the same comparable space (see
// nextTopLevelOrder in db.ts) so they interleave correctly as one list.
// Deliberately manual sort_order, not computed planned date: that reshuffles
// rows every time the schedule recalculates, which is more disorienting than
// useful here.
export function groupTasks<T extends Groupable>(tasks: T[]): GroupedTask<T>[] {
  const orderOf = (t: T) => t.sortOrder ?? t.id;

  interface Unit {
    order: number;
    groupId: number | null;
    groupName: string;
    items: T[];
  }
  const unitByGroup = new Map<number, Unit>();
  const units: Unit[] = [];
  for (const t of tasks) {
    if (t.groupId != null) {
      let u = unitByGroup.get(t.groupId);
      if (!u) {
        u = { order: t.groupSortOrder ?? t.groupId, groupId: t.groupId, groupName: t.groupName ?? "", items: [] };
        unitByGroup.set(t.groupId, u);
        units.push(u);
      }
      u.items.push(t);
    } else {
      units.push({ order: orderOf(t), groupId: null, groupName: t.name, items: [t] });
    }
  }
  units.sort((a, b) => a.order - b.order);

  const out: GroupedTask<T>[] = [];
  for (const u of units) {
    if (u.groupId == null) {
      out.push({ t: u.items[0], base: u.groupName, suffix: null, groupId: null });
    } else {
      const sorted = [...u.items].sort((a, b) => orderOf(a) - orderOf(b));
      for (const t of sorted) out.push({ t, base: u.groupName, suffix: t.name, groupId: u.groupId });
    }
  }
  return out;
}
