// Persistence layer — node:sqlite (built-in, no native build needed).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Project, Resource, Task, TaskStatus } from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "planner.db");

// Keep a single connection across Next.js dev hot-reloads.
const g = globalThis as unknown as { __plannerDb?: DatabaseSync };

function openDb(): DatabaseSync {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      deadline TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      capacity_hours_per_day REAL NOT NULL DEFAULT 8,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      estimation_hours REAL NOT NULL DEFAULT 0,
      skills TEXT NOT NULL DEFAULT '[]',
      resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
      start_date_override TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'not_started',
      actual_end TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_deps (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on)
    );
  `);
  migrateSortOrder(db);
  return db;
}

// sort_order didn't exist in the original schema — add it for existing DBs
// (CREATE TABLE IF NOT EXISTS above is a no-op once the table already
// exists), then backfill so pre-existing rows keep their current (id) order.
function migrateSortOrder(db: DatabaseSync): void {
  const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (cols.some((c) => c.name === "sort_order")) return;
  db.exec("ALTER TABLE tasks ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;");
  db.exec("UPDATE tasks SET sort_order = id;");
}

export function db(): DatabaseSync {
  if (!g.__plannerDb) {
    g.__plannerDb = openDb();
    seedIfEmpty(g.__plannerDb);
  }
  return g.__plannerDb;
}

// --- row mappers --------------------------------------------------------------

type ProjectRow = { id: number; name: string; deadline: string; created_at: string };
type ResourceRow = {
  id: number;
  name: string;
  skills: string;
  capacity_hours_per_day: number;
  created_at: string;
};
type TaskRow = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  estimation_hours: number;
  skills: string;
  resource_id: number | null;
  start_date_override: string | null;
  progress: number;
  status: string;
  actual_end: string | null;
  sort_order: number;
  created_at: string;
};

function mapProject(r: ProjectRow): Project {
  return { id: r.id, name: r.name, deadline: r.deadline, createdAt: r.created_at };
}
function mapResource(r: ResourceRow): Resource {
  return {
    id: r.id,
    name: r.name,
    skills: parseTags(r.skills),
    capacityHoursPerDay: r.capacity_hours_per_day,
    createdAt: r.created_at,
  };
}
function parseTags(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// --- projects -----------------------------------------------------------------

export function listProjects(): Project[] {
  return (db().prepare("SELECT * FROM projects ORDER BY created_at DESC, id DESC").all() as ProjectRow[]).map(
    mapProject,
  );
}
export function getProject(id: number): Project | null {
  const r = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  return r ? mapProject(r) : null;
}
export function createProject(name: string, deadline: string): Project {
  const now = new Date().toISOString();
  const info = db()
    .prepare("INSERT INTO projects (name, deadline, created_at) VALUES (?, ?, ?)")
    .run(name, deadline, now);
  return getProject(Number(info.lastInsertRowid))!;
}
export function updateProject(id: number, name: string, deadline: string): Project | null {
  db().prepare("UPDATE projects SET name = ?, deadline = ? WHERE id = ?").run(name, deadline, id);
  return getProject(id);
}
export function deleteProject(id: number): void {
  db().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

// --- resources ----------------------------------------------------------------

export function listResources(): Resource[] {
  return (db().prepare("SELECT * FROM resources ORDER BY name COLLATE NOCASE").all() as ResourceRow[]).map(
    mapResource,
  );
}
export function getResource(id: number): Resource | null {
  const r = db().prepare("SELECT * FROM resources WHERE id = ?").get(id) as ResourceRow | undefined;
  return r ? mapResource(r) : null;
}
export function createResource(name: string, skills: string[], capacity: number): Resource {
  const now = new Date().toISOString();
  const info = db()
    .prepare(
      "INSERT INTO resources (name, skills, capacity_hours_per_day, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(name, JSON.stringify(skills), capacity, now);
  return getResource(Number(info.lastInsertRowid))!;
}
export function updateResource(
  id: number,
  name: string,
  skills: string[],
  capacity: number,
): Resource | null {
  db()
    .prepare("UPDATE resources SET name = ?, skills = ?, capacity_hours_per_day = ? WHERE id = ?")
    .run(name, JSON.stringify(skills), capacity, id);
  return getResource(id);
}
export function deleteResource(id: number): void {
  db().prepare("DELETE FROM resources WHERE id = ?").run(id);
}
export function countActiveAssignments(resourceId: number): number {
  const r = db()
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE resource_id = ? AND status != 'done'")
    .get(resourceId) as { n: number };
  return r.n;
}

// --- tasks --------------------------------------------------------------------

function depsFor(taskId: number): number[] {
  return (
    db().prepare("SELECT depends_on FROM task_deps WHERE task_id = ?").all(taskId) as {
      depends_on: number;
    }[]
  ).map((r) => r.depends_on);
}

function mapTask(r: TaskRow): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    estimationHours: r.estimation_hours,
    skills: parseTags(r.skills),
    resourceId: r.resource_id,
    startDateOverride: r.start_date_override,
    progress: r.progress,
    status: r.status as TaskStatus,
    actualEnd: r.actual_end,
    sortOrder: r.sort_order,
    dependsOn: depsFor(r.id),
    createdAt: r.created_at,
  };
}

export function listTasksByProject(projectId: number): Task[] {
  return (
    db()
      .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, id")
      .all(projectId) as TaskRow[]
  ).map(mapTask);
}
export function listAllTasks(): Task[] {
  return (db().prepare("SELECT * FROM tasks ORDER BY sort_order, id").all() as TaskRow[]).map(mapTask);
}
export function getTask(id: number): Task | null {
  const r = db().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return r ? mapTask(r) : null;
}

export interface TaskInput {
  projectId: number;
  name: string;
  description?: string | null;
  estimationHours: number;
  skills: string[];
  resourceId?: number | null;
  startDateOverride?: string | null;
  dependsOn?: number[];
}

function setDeps(taskId: number, deps: number[]): void {
  const d = db();
  d.prepare("DELETE FROM task_deps WHERE task_id = ?").run(taskId);
  const stmt = d.prepare("INSERT OR IGNORE INTO task_deps (task_id, depends_on) VALUES (?, ?)");
  for (const dep of deps) {
    if (dep !== taskId) stmt.run(taskId, dep);
  }
}

export function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  const maxOrder = db()
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks WHERE project_id = ?")
    .get(input.projectId) as { m: number };
  const info = db()
    .prepare(
      `INSERT INTO tasks (project_id, name, description, estimation_hours, skills, resource_id, start_date_override, progress, status, actual_end, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'not_started', NULL, ?, ?)`,
    )
    .run(
      input.projectId,
      input.name,
      input.description ?? null,
      input.estimationHours,
      JSON.stringify(input.skills),
      input.resourceId ?? null,
      input.startDateOverride ?? null,
      maxOrder.m + 1,
      now,
    );
  const id = Number(info.lastInsertRowid);
  setDeps(id, input.dependsOn ?? []);
  return getTask(id)!;
}

export function updateTaskSortOrder(id: number, sortOrder: number): Task | null {
  db().prepare("UPDATE tasks SET sort_order = ? WHERE id = ?").run(sortOrder, id);
  return getTask(id);
}

export function updateTask(
  id: number,
  input: Omit<TaskInput, "projectId">,
): Task | null {
  db()
    .prepare(
      `UPDATE tasks SET name = ?, description = ?, estimation_hours = ?, skills = ?, resource_id = ?, start_date_override = ? WHERE id = ?`,
    )
    .run(
      input.name,
      input.description ?? null,
      input.estimationHours,
      JSON.stringify(input.skills),
      input.resourceId ?? null,
      input.startDateOverride ?? null,
      id,
    );
  setDeps(id, input.dependsOn ?? []);
  return getTask(id);
}

export function updateTaskProgress(
  id: number,
  progress: number,
  status: TaskStatus,
  actualEnd: string | null,
): Task | null {
  db()
    .prepare("UPDATE tasks SET progress = ?, status = ?, actual_end = ? WHERE id = ?")
    .run(progress, status, actualEnd, id);
  return getTask(id);
}

export function assignTask(id: number, resourceId: number | null): Task | null {
  db().prepare("UPDATE tasks SET resource_id = ? WHERE id = ?").run(resourceId, id);
  return getTask(id);
}

export function deleteTask(id: number): void {
  db().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

// tasks that depend on the given task (i.e. list it as a predecessor)
export function dependentsOf(taskId: number): Task[] {
  const ids = (
    db().prepare("SELECT task_id FROM task_deps WHERE depends_on = ?").all(taskId) as {
      task_id: number;
    }[]
  ).map((r) => r.task_id);
  return ids.map((id) => getTask(id)).filter((t): t is Task => t != null);
}

// --- seed ---------------------------------------------------------------------

function seedIfEmpty(database: DatabaseSync): void {
  const n = database.prepare("SELECT COUNT(*) AS c FROM projects").get() as { c: number };
  if (n.c > 0) return;
  const now = new Date().toISOString();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (base: Date, days: number) => {
    const x = new Date(base);
    x.setDate(x.getDate() + days);
    return x;
  };
  const today = new Date();

  const resStmt = database.prepare(
    "INSERT INTO resources (name, skills, capacity_hours_per_day, created_at) VALUES (?, ?, ?, ?)",
  );
  const jane = Number(
    resStmt.run("Jane Doe", JSON.stringify(["frontend", "design"]), 8, now).lastInsertRowid,
  );
  const mike = Number(
    resStmt.run("Mike Kim", JSON.stringify(["frontend", "backend"]), 8, now).lastInsertRowid,
  );
  Number(resStmt.run("Priya N.", JSON.stringify(["backend", "qa"]), 6, now).lastInsertRowid);

  const projStmt = database.prepare(
    "INSERT INTO projects (name, deadline, created_at) VALUES (?, ?, ?)",
  );
  const proj = Number(
    projStmt.run("Website Relaunch", iso(addDays(today, 21)), now).lastInsertRowid,
  );

  const taskStmt = database.prepare(
    `INSERT INTO tasks (project_id, name, description, estimation_hours, skills, resource_id, start_date_override, progress, status, actual_end, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const t1 = Number(
    taskStmt.run(
      proj, "Design mockups", "Homepage + product page comps", 16,
      JSON.stringify(["design"]), jane, null, 100, "done", iso(addDays(today, 2)), now,
    ).lastInsertRowid,
  );
  const t2 = Number(
    taskStmt.run(
      proj, "Build components", "Reusable component library", 40,
      JSON.stringify(["frontend"]), mike, null, 40, "in_progress", null, now,
    ).lastInsertRowid,
  );
  const t3 = Number(
    taskStmt.run(
      proj, "QA pass", "Cross-browser + accessibility", 24,
      JSON.stringify(["security"]), null, null, 0, "not_started", null, now,
    ).lastInsertRowid,
  );
  const depStmt = database.prepare(
    "INSERT INTO task_deps (task_id, depends_on) VALUES (?, ?)",
  );
  depStmt.run(t2, t1);
  depStmt.run(t3, t2);
}
