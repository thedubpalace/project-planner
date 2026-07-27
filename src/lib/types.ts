// Shared domain types for project-planner

export type TaskStatus = "not_started" | "in_progress" | "done";

export interface Project {
  id: number;
  name: string;
  deadline: string; // ISO date (YYYY-MM-DD)
  createdAt: string;
}

export interface Resource {
  id: number;
  name: string;
  skills: string[];
  capacityHoursPerDay: number;
  createdAt: string;
}

export interface Task {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  estimationHours: number;
  skills: string[];
  resourceId: number | null;
  startDateOverride: string | null; // ISO date or null (auto)
  progress: number; // 0..100
  status: TaskStatus;
  actualEnd: string | null; // ISO date set when marked done
  dependsOn: number[]; // predecessor task ids (finish-to-start)
  createdAt: string;
}

// Computed schedule fields layered on top of a Task
export interface ScheduledTask extends Task {
  plannedStart: string; // ISO date
  plannedEnd: string; // ISO date
  effectiveEnd: string; // actualEnd if done else plannedEnd
  resourceName: string | null;
  isUnassigned: boolean;
  overDeadline: boolean; // this task's finish pushes past / exceeds deadline
  durationDays: number; // business days
  behindPace: boolean; // elapsed share of the planned window exceeds progress %
  forecastStart: string | null; // set when behind (own) or cascaded from a delayed predecessor
  forecastEnd: string | null;
}

export type ProjectRisk = "on_track" | "at_risk" | "over_deadline";

export interface ProjectSchedule {
  projectId: number;
  deadline: string;
  projectedFinish: string | null; // null when no tasks
  risk: ProjectRisk;
  breachDays: number; // days projectedFinish exceeds deadline (0 if none)
  affectedTaskIds: number[]; // tasks flagged over-deadline / on the breach chain
  tasks: ScheduledTask[];
  progressPct: number; // estimation-weighted average progress
}

// Resource with cross-project workload figures
export interface ResourceLoad extends Resource {
  bookedHours: number; // outstanding (not-done) booked hours across all projects
  weekHours: number; // hours booked in the current week across all projects
  weekCapacity: number; // capacity * business days this week
  assignmentCount: number; // number of active (not-done) task assignments
}

export interface ResourceAssignmentDetail {
  taskId: number;
  taskName: string;
  projectId: number;
  projectName: string;
  plannedStart: string;
  plannedEnd: string;
  status: TaskStatus;
}
