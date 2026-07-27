// Client-side fetch helpers.
import type {
  Project,
  ProjectSchedule,
  Resource,
  ResourceAssignmentDetail,
  ResourceLoad,
  ScheduledTask,
  Task,
  TaskStatus,
} from "./types";

export type {
  Project,
  ProjectSchedule,
  Resource,
  ResourceAssignmentDetail,
  ResourceLoad,
  ScheduledTask,
  Task,
  TaskStatus,
};

export interface DashboardProject {
  id: number;
  name: string;
  deadline: string;
  createdAt: string;
  schedule: ProjectSchedule;
  taskCount: number;
  unassignedCount: number;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_PATH}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error ?? `Request failed (${res.status})`) as Error & {
      status: number;
      data: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  dashboard: () => req<DashboardProject[]>("/api/projects"),
  createProject: (name: string, deadline: string) =>
    req<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, deadline }) }),
  getProject: (id: number) =>
    req<{ project: Project; schedule: ProjectSchedule; resources: Resource[] }>(
      `/api/projects/${id}`,
    ),
  updateProject: (id: number, name: string, deadline: string) =>
    req<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, deadline }),
    }),
  deleteProject: (id: number) => req(`/api/projects/${id}`, { method: "DELETE" }),

  resources: () => req<ResourceLoad[]>("/api/resources"),
  createResource: (name: string, skills: string[], capacityHoursPerDay: number) =>
    req<Resource>("/api/resources", {
      method: "POST",
      body: JSON.stringify({ name, skills, capacityHoursPerDay }),
    }),
  getResource: (id: number) =>
    req<{ resource: Resource; assignments: ResourceAssignmentDetail[] }>(`/api/resources/${id}`),
  updateResource: (id: number, name: string, skills: string[], capacityHoursPerDay: number) =>
    req<Resource>(`/api/resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, skills, capacityHoursPerDay }),
    }),
  deleteResource: (id: number) => req(`/api/resources/${id}`, { method: "DELETE" }),

  createTask: (input: TaskCreateInput) =>
    req<{ task: Task; schedule: ProjectSchedule }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTask: (id: number, input: TaskUpdateInput) =>
    req<{ task: Task; schedule: ProjectSchedule }>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTask: (id: number, force = false) =>
    req<{ ok: boolean; schedule: ProjectSchedule }>(
      `/api/tasks/${id}${force ? "?force=1" : ""}`,
      { method: "DELETE" },
    ),
  updateProgress: (id: number, progress: number, status?: TaskStatus, actualEnd?: string) =>
    req<ProgressResult>(`/api/tasks/${id}/progress`, {
      method: "POST",
      body: JSON.stringify({ progress, status, actualEnd }),
    }),
};

export interface TaskCreateInput {
  projectId: number;
  name: string;
  description?: string | null;
  estimationHours: number;
  skills: string[];
  resourceId?: number | null;
  startDateOverride?: string | null;
  dependsOn?: number[];
}

export type TaskUpdateInput = Partial<Omit<TaskCreateInput, "projectId" | "resourceId">> & {
  resourceId?: number | null | "auto";
};

export interface ProgressResult {
  task: Task;
  schedule: ProjectSchedule;
  shifted: { id: number; name: string; status: TaskStatus }[];
  breached: boolean;
  atRisk: boolean;
}
