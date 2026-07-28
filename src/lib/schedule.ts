// Scheduling engine — pure functions. The one thing this app must not get wrong.
// Business days = Mon–Fri only (v1 non-goal: no holiday calendar).

import { addDays, differenceInCalendarDays, isWeekend, parseISO } from "date-fns";
import type {
  ProjectRisk,
  ProjectSchedule,
  Resource,
  ScheduledTask,
  Task,
} from "./types";

const DEFAULT_CAPACITY = 8;

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISO(s: string): Date {
  // parse as local date (avoid TZ shifting)
  return parseISO(s + "T00:00:00");
}

// Roll a date forward to the next business day (Mon–Fri). Idempotent on weekdays.
export function rollForward(d: Date): Date {
  let cur = d;
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur;
}

// From a business-day start, advance `n` business days. n=0 returns the start.
export function addBusinessDays(start: Date, n: number): Date {
  let cur = rollForward(start);
  let counted = 0;
  while (counted < n) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur)) counted += 1;
  }
  return cur;
}

// Count business days in [start, end] inclusive (both dates any day).
export function businessDaysInclusive(start: Date, end: Date): number {
  if (end < start) return 0;
  let cur = new Date(start);
  let count = 0;
  while (cur <= end) {
    if (!isWeekend(cur)) count += 1;
    cur = addDays(cur, 1);
  }
  return count;
}

export function durationDays(estimationHours: number, capacity: number): number {
  const cap = capacity > 0 ? capacity : DEFAULT_CAPACITY;
  return Math.max(1, Math.ceil(estimationHours / cap));
}

// Topological order of tasks by finish-to-start dependency (Kahn). Cycle-safe:
// any tasks left in a cycle are appended in id order so we never drop data.
function topoOrder(tasks: Task[]): Task[] {
  const byId = new Map<number, Task>();
  tasks.forEach((t) => byId.set(t.id, t));
  const indegree = new Map<number, number>();
  const dependents = new Map<number, number[]>(); // pred -> successors
  tasks.forEach((t) => {
    indegree.set(t.id, 0);
    dependents.set(t.id, []);
  });
  tasks.forEach((t) => {
    for (const dep of t.dependsOn) {
      if (!byId.has(dep)) continue; // ignore dangling
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      dependents.get(dep)!.push(t.id);
    }
  });
  const queue: number[] = [];
  [...indegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)
    .sort((a, b) => a - b)
    .forEach((id) => queue.push(id));

  const order: Task[] = [];
  const visited = new Set<number>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(byId.get(id)!);
    const next = [...(dependents.get(id) ?? [])].sort((a, b) => a - b);
    for (const s of next) {
      indegree.set(s, (indegree.get(s) ?? 1) - 1);
      if ((indegree.get(s) ?? 0) === 0) queue.push(s);
    }
  }
  // append any unvisited (cycle members) deterministically
  tasks
    .filter((t) => !visited.has(t.id))
    .sort((a, b) => a.id - b.id)
    .forEach((t) => order.push(t));
  return order;
}

export interface ScheduleInput {
  tasks: Task[];
  resources: Resource[];
  asOf?: string; // anchor date for tasks with no override/predecessor; default today
}

// Compute planned dates for every task in a project.
export function computeTaskSchedule(input: ScheduleInput): Map<number, ScheduledTask> {
  const asOf = fromISO(input.asOf ?? todayISO());
  const resById = new Map<number, Resource>();
  input.resources.forEach((r) => resById.set(r.id, r));
  const ordered = topoOrder(input.tasks);
  const result = new Map<number, ScheduledTask>();

  for (const t of ordered) {
    const res = t.resourceId != null ? resById.get(t.resourceId) ?? null : null;
    const capacity = res?.capacityHoursPerDay ?? DEFAULT_CAPACITY;
    const dur = durationDays(t.estimationHours, capacity);

    // earliest start = max(basis, each predecessor's effectiveEnd + 1 business day)
    const candidates: Date[] = [];
    if (t.startDateOverride) candidates.push(fromISO(t.startDateOverride));
    let hasPredecessor = false;
    for (const depId of t.dependsOn) {
      const dep = result.get(depId);
      if (!dep) continue;
      hasPredecessor = true;
      candidates.push(addBusinessDays(fromISO(dep.effectiveEnd), 1));
    }
    if (!t.startDateOverride && !hasPredecessor) candidates.push(asOf);
    const earliest = candidates.reduce((a, b) => (b > a ? b : a), candidates[0] ?? asOf);

    const plannedStart = rollForward(earliest);
    const plannedEnd = addBusinessDays(plannedStart, dur - 1);
    const effectiveEnd =
      t.status === "done" && t.actualEnd ? fromISO(t.actualEnd) : plannedEnd;

    // Behind pace: more of the planned window has elapsed than the task's
    // progress accounts for (e.g. 3 of 4 planned days gone but only 25%
    // done). Not meaningful once done — a done task's schedule is fixed to
    // its actual completion date, not this comparison.
    const expectedPct =
      asOf <= plannedStart ? 0 : asOf >= plannedEnd ? 100 : Math.min(100, Math.round((businessDaysInclusive(plannedStart, asOf) / dur) * 100));
    const behindPace = t.status !== "done" && t.progress < expectedPct;

    // Forecast: at the current rate, when would this task actually finish?
    // Linear extrapolation from elapsed-days-vs-progress-so-far. A task with
    // 0% logged yet has no rate to extrapolate — fall back to "as if it
    // started today and took the full planned duration."
    let forecastEnd: string | null = null;
    if (behindPace) {
      if (t.progress > 0) {
        const elapsedDays = businessDaysInclusive(plannedStart, asOf);
        const remainingDays = Math.max(1, Math.ceil((elapsedDays * (100 - t.progress)) / t.progress));
        forecastEnd = toISO(addBusinessDays(asOf, remainingDays - 1));
      } else {
        forecastEnd = toISO(addBusinessDays(asOf, dur - 1));
      }
    }

    result.set(t.id, {
      ...t,
      plannedStart: toISO(plannedStart),
      plannedEnd: toISO(plannedEnd),
      effectiveEnd: toISO(effectiveEnd),
      resourceName: res?.name ?? null,
      isUnassigned: t.resourceId == null,
      overDeadline: false, // filled by computeProjectSchedule
      durationDays: dur,
      behindPace,
      forecastStart: behindPace ? toISO(plannedStart) : null,
      forecastEnd,
    });
  }

  // Cascade forecast delays through finish-to-start dependencies: a task
  // with no overrun of its own still shifts if a predecessor is forecast to
  // finish later than planned. Runs in the same topo order, so a
  // predecessor's final forecast is settled before its successors read it.
  for (const t of ordered) {
    const st = result.get(t.id)!;
    let cascaded: Date | null = null;
    for (const depId of t.dependsOn) {
      const dep = result.get(depId);
      if (!dep?.forecastEnd) continue;
      const candidate = addBusinessDays(fromISO(dep.forecastEnd), 1);
      if (!cascaded || candidate > cascaded) cascaded = candidate;
    }
    if (!cascaded) continue;
    const forecastStartDate = rollForward(cascaded);
    if (forecastStartDate <= fromISO(st.plannedStart)) continue;
    const forecastEndDate = addBusinessDays(forecastStartDate, st.durationDays - 1);
    // A task can be behind on its own pace *and* pushed further by a
    // delayed predecessor — keep whichever forecast finishes later, since
    // it can never truly finish before its predecessor does.
    if (!st.forecastEnd || forecastEndDate > fromISO(st.forecastEnd)) {
      result.set(t.id, {
        ...st,
        forecastStart: toISO(forecastStartDate),
        forecastEnd: toISO(forecastEndDate),
      });
    }
  }

  return result;
}

export function computeProjectSchedule(
  deadline: string,
  input: ScheduleInput,
): ProjectSchedule {
  const map = computeTaskSchedule(input);
  const tasks = [...map.values()].sort((a, b) =>
    a.plannedStart < b.plannedStart ? -1 : a.plannedStart > b.plannedStart ? 1 : a.id - b.id,
  );

  const deadlineDate = fromISO(deadline);
  let projectedFinish: string | null = null;
  let earliestStart: string | null = null;
  for (const t of tasks) {
    if (projectedFinish === null || t.effectiveEnd > projectedFinish)
      projectedFinish = t.effectiveEnd;
    if (earliestStart === null || t.plannedStart < earliestStart)
      earliestStart = t.plannedStart;
  }

  let risk: ProjectRisk = "on_track";
  let breachDays = 0;
  const affected: number[] = [];

  if (projectedFinish) {
    const projDate = fromISO(projectedFinish);
    const overBy = differenceInCalendarDays(projDate, deadlineDate);
    if (overBy > 0) {
      risk = "over_deadline";
      breachDays = overBy;
      for (const t of tasks) {
        if (fromISO(t.effectiveEnd) > deadlineDate) {
          t.overDeadline = true;
          affected.push(t.id);
        }
      }
    } else {
      // at-risk: slack (business days from projected finish to deadline) is a small
      // fraction of the total planned span.
      const totalSpan = businessDaysInclusive(
        fromISO(earliestStart ?? projectedFinish),
        projDate,
      );
      const slack = businessDaysInclusive(addDays(projDate, 1), deadlineDate);
      if (totalSpan > 0 && slack < 0.1 * totalSpan) risk = "at_risk";
    }
  }

  const totalEst = tasks.reduce((s, t) => s + t.estimationHours, 0);
  const progressPct =
    totalEst > 0
      ? Math.round(tasks.reduce((s, t) => s + t.estimationHours * t.progress, 0) / totalEst)
      : 0;

  return {
    projectId: tasks[0]?.projectId ?? 0,
    deadline,
    projectedFinish,
    risk,
    breachDays,
    affectedTaskIds: affected,
    tasks,
    progressPct,
  };
}

// --- Auto-match ---------------------------------------------------------------

export interface MatchCandidate {
  resource: Resource;
  matched: boolean; // has at least one overlapping skill tag
  bookedHours: number; // outstanding booked hours across all projects
}

// Rank resources for a task's required skill tags: skill-matches first (by ascending
// booked workload), then non-matches (also by workload). bookedHours is passed in
// already computed across ALL projects (design note 6).
export function rankCandidates(
  requiredSkills: string[],
  resources: Resource[],
  bookedByResource: Map<number, number>,
): MatchCandidate[] {
  const req = requiredSkills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const candidates: MatchCandidate[] = resources.map((r) => {
    const skills = r.skills.map((s) => s.trim().toLowerCase());
    const matched = req.length > 0 && req.some((s) => skills.includes(s));
    return { resource: r, matched, bookedHours: bookedByResource.get(r.id) ?? 0 };
  });
  return candidates.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    if (a.bookedHours !== b.bookedHours) return a.bookedHours - b.bookedHours;
    return a.resource.name.localeCompare(b.resource.name);
  });
}

// Pick the best auto-assign resource: skill-matched with least workload. Returns null
// (→ task stays unassigned) when no resource has a matching skill tag.
export function autoMatch(
  requiredSkills: string[],
  resources: Resource[],
  bookedByResource: Map<number, number>,
): Resource | null {
  const ranked = rankCandidates(requiredSkills, resources, bookedByResource);
  const best = ranked.find((c) => c.matched);
  return best ? best.resource : null;
}
