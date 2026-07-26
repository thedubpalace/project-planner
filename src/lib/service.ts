// Service layer — composes persistence (db) with the scheduling engine.
import { addDays, startOfWeek } from "date-fns";
import * as store from "./db";
import {
  businessDaysInclusive,
  computeProjectSchedule,
  toISO,
} from "./schedule";
import type {
  ProjectSchedule,
  ResourceAssignmentDetail,
  ResourceLoad,
  Task,
} from "./types";

function fromISO(s: string): Date {
  return new Date(s + "T00:00:00");
}

export function projectSchedule(projectId: number): ProjectSchedule | null {
  const project = store.getProject(projectId);
  if (!project) return null;
  const tasks = store.listTasksByProject(projectId);
  const resources = store.listResources();
  return computeProjectSchedule(project.deadline, { tasks, resources });
}

export interface DashboardProject {
  id: number;
  name: string;
  deadline: string;
  createdAt: string;
  schedule: ProjectSchedule;
  taskCount: number;
  unassignedCount: number;
}

export function dashboard(): DashboardProject[] {
  const projects = store.listProjects();
  const resources = store.listResources();
  return projects.map((p) => {
    const tasks = store.listTasksByProject(p.id);
    const schedule = computeProjectSchedule(p.deadline, { tasks, resources });
    return {
      id: p.id,
      name: p.name,
      deadline: p.deadline,
      createdAt: p.createdAt,
      schedule,
      taskCount: tasks.length,
      unassignedCount: tasks.filter((t) => t.resourceId == null).length,
    };
  });
}

// Outstanding (not-done) booked estimation hours per resource, across ALL projects.
// This is the auto-match "workload" proxy (design note 6 — cross-project scope).
export function bookedHoursByResource(): Map<number, number> {
  const tasks = store.listAllTasks();
  const map = new Map<number, number>();
  for (const t of tasks) {
    if (t.resourceId == null || t.status === "done") continue;
    map.set(t.resourceId, (map.get(t.resourceId) ?? 0) + t.estimationHours);
  }
  return map;
}

// Full cross-project load figures for the Resources page + auto-match preview.
export function resourceLoads(): ResourceLoad[] {
  const resources = store.listResources();
  const allTasks = store.listAllTasks();
  const booked = bookedHoursByResource();

  // schedule every project once so we can locate task date windows
  const byProject = new Map<number, Task[]>();
  for (const t of allTasks) {
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId)!.push(t);
  }
  const scheduledByTask = new Map<number, { start: string; end: string }>();
  for (const [projectId, tasks] of byProject) {
    const p = store.getProject(projectId);
    if (!p) continue;
    const sched = computeProjectSchedule(p.deadline, { tasks, resources });
    for (const st of sched.tasks) {
      scheduledByTask.set(st.id, { start: st.plannedStart, end: st.effectiveEnd });
    }
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
  const weekEnd = addDays(weekStart, 4); // Friday
  const businessDaysThisWeek = businessDaysInclusive(weekStart, weekEnd);

  return resources.map((r) => {
    let weekHours = 0;
    let assignmentCount = 0;
    for (const t of allTasks) {
      if (t.resourceId !== r.id) continue;
      if (t.status !== "done") assignmentCount += 1;
      const win = scheduledByTask.get(t.id);
      if (!win) continue;
      const s = fromISO(win.start);
      const e = fromISO(win.end);
      const overlapStart = s > weekStart ? s : weekStart;
      const overlapEnd = e < weekEnd ? e : weekEnd;
      const days = businessDaysInclusive(overlapStart, overlapEnd);
      if (days > 0) weekHours += days * r.capacityHoursPerDay;
    }
    return {
      ...r,
      bookedHours: booked.get(r.id) ?? 0,
      weekHours,
      weekCapacity: r.capacityHoursPerDay * businessDaysThisWeek,
      assignmentCount,
    };
  });
}

export function resourceAssignments(resourceId: number): ResourceAssignmentDetail[] {
  const allTasks = store.listAllTasks();
  const resources = store.listResources();
  const out: ResourceAssignmentDetail[] = [];
  const byProject = new Map<number, Task[]>();
  for (const t of allTasks) {
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId)!.push(t);
  }
  for (const [projectId, tasks] of byProject) {
    if (!tasks.some((t) => t.resourceId === resourceId)) continue;
    const p = store.getProject(projectId);
    if (!p) continue;
    const sched = computeProjectSchedule(p.deadline, { tasks, resources });
    for (const st of sched.tasks) {
      if (st.resourceId !== resourceId) continue;
      out.push({
        taskId: st.id,
        taskName: st.name,
        projectId: p.id,
        projectName: p.name,
        plannedStart: st.plannedStart,
        plannedEnd: st.plannedEnd,
        status: st.status,
      });
    }
  }
  return out;
}

export { toISO };
