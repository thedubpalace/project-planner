import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysInclusive, computeTaskSchedule, rollForward, toISO } from "./schedule";
import type { Resource, Task } from "./types";

const RESOURCE: Resource = { id: 1, name: "R", skills: [], capacityHoursPerDay: 8, createdAt: "2026-01-01" };

const BASE: Omit<Task, "id" | "estimationHours" | "progress" | "startDateOverride" | "dependsOn"> = {
  projectId: 1,
  name: "T",
  description: null,
  skills: [],
  resourceId: 1,
  status: "in_progress",
  actualEnd: null,
  sortOrder: 0,
  createdAt: "2026-01-01",
  groupId: null,
  groupName: null,
  groupSortOrder: null,
};

// A fixed Monday to anchor every scenario's plannedStart, rolled to a real
// business day so addBusinessDays/businessDaysInclusive math is exact.
const START = rollForward(new Date("2026-07-06T00:00:00"));

function task(opts: {
  id: number;
  durBusinessDays: number; // estimationHours chosen so durationDays === this
  progress: number;
  elapsedDays: number; // business days between plannedStart and asOf
  dependsOn?: number[];
}): { t: Task; asOf: string } {
  const asOfDate = addBusinessDays(START, Math.max(0, opts.elapsedDays - 1));
  const t: Task = {
    ...BASE,
    id: opts.id,
    estimationHours: opts.durBusinessDays * 8, // capacity 8/day => durationDays === durBusinessDays
    progress: opts.progress,
    startDateOverride: opts.dependsOn?.length ? null : toISO(START),
    dependsOn: opts.dependsOn ?? [],
  };
  return { t, asOf: toISO(asOfDate) };
}

describe("behindPace tolerance band", () => {
  it("does not flag a shortfall exactly at the threshold", () => {
    // dur=20 => threshold = max(5, round(100/20)) = 5. elapsedDays=10 => expectedPct=50.
    // progress=45 => expectedPct - progress = 5, not > 5.
    const { t, asOf } = task({ id: 1, durBusinessDays: 20, progress: 45, elapsedDays: 10 });
    const result = computeTaskSchedule({ tasks: [t], resources: [RESOURCE], asOf });
    expect(result.get(1)!.behindPace).toBe(false);
    expect(result.get(1)!.forecastEnd).toBeNull();
  });

  it("flags a shortfall one point past the threshold", () => {
    const { t, asOf } = task({ id: 1, durBusinessDays: 20, progress: 44, elapsedDays: 10 });
    const result = computeTaskSchedule({ tasks: [t], resources: [RESOURCE], asOf });
    expect(result.get(1)!.behindPace).toBe(true);
    expect(result.get(1)!.forecastEnd).not.toBeNull();
  });

  it("gives a very short task an all-or-nothing band (never flags mid-flight)", () => {
    // dur=1 => threshold = max(5, round(100/1)) = 100. Evaluated the business day AFTER
    // the task's single planned day (elapsedDays=2), expectedPct saturates at 100 — even
    // then, 100 - progress(0) = 100 is not > 100, so a 1-day task can never be flagged
    // "partially behind pace" no matter how late it's checked.
    const { t, asOf } = task({ id: 1, durBusinessDays: 1, progress: 0, elapsedDays: 2 });
    const result = computeTaskSchedule({ tasks: [t], resources: [RESOURCE], asOf });
    expect(result.get(1)!.behindPace).toBe(false);
  });
});

describe("damped extrapolation", () => {
  it("pulls an early, low-progress forecast toward the plan instead of the raw observed rate", () => {
    // dur=10, elapsedDays=3, progress=5 => expectedPct=30, threshold=10, diff=25 (flagged).
    // Undamped (old) formula: remainingDays = ceil(3 * 95 / 5) = 57.
    // Damped: elapsedFrac=0.3, observedRemaining=57, plannedRemaining=7,
    // blended = 0.3*57 + 0.7*7 = 21.1 => ceil = 22.
    const { t, asOf } = task({ id: 1, durBusinessDays: 10, progress: 5, elapsedDays: 3 });
    const result = computeTaskSchedule({ tasks: [t], resources: [RESOURCE], asOf });
    const forecastEnd = result.get(1)!.forecastEnd!;

    const asOfDate = new Date(asOf + "T00:00:00");
    const undampedRemaining = Math.ceil((3 * (100 - 5)) / 5); // 57
    const undampedForecastEnd = toISO(addBusinessDays(asOfDate, undampedRemaining - 1));
    const dampedRemaining = 22;
    const dampedForecastEnd = toISO(addBusinessDays(asOfDate, dampedRemaining - 1));

    expect(forecastEnd).toBe(dampedForecastEnd);
    expect(forecastEnd).not.toBe(undampedForecastEnd);
    // sanity: damping pulls the date meaningfully earlier than the raw rate would
    expect(businessDaysInclusive(asOfDate, new Date(forecastEnd + "T00:00:00"))).toBeLessThan(undampedRemaining);
  });

  it("converges to the observed rate once most of the plan has elapsed", () => {
    // dur=10, elapsedDays=9, progress=50 => expectedPct=90, threshold=5, diff=40 (flagged).
    // observedRemaining = 9*50/50 = 9, plannedRemaining = 1, elapsedFrac = 0.9.
    // blended = 0.9*9 + 0.1*1 = 8.2 => ceil = 9 — same as the undamped formula.
    const { t, asOf } = task({ id: 1, durBusinessDays: 10, progress: 50, elapsedDays: 9 });
    const result = computeTaskSchedule({ tasks: [t], resources: [RESOURCE], asOf });
    const forecastEnd = result.get(1)!.forecastEnd!;

    const asOfDate = new Date(asOf + "T00:00:00");
    const undampedRemaining = Math.ceil((9 * (100 - 50)) / 50); // 9
    const undampedForecastEnd = toISO(addBusinessDays(asOfDate, undampedRemaining - 1));

    expect(forecastEnd).toBe(undampedForecastEnd);
  });

  it("leaves the progress=0 fallback (full planned duration from today) untouched", () => {
    const { t, asOf } = task({ id: 1, durBusinessDays: 15, progress: 0, elapsedDays: 5 });
    const result = computeTaskSchedule({ tasks: [t], resources: [RESOURCE], asOf });
    const st = result.get(1)!;
    expect(st.behindPace).toBe(true); // expectedPct ~33, threshold 7, diff ~33 > 7
    const asOfDate = new Date(asOf + "T00:00:00");
    expect(st.forecastEnd).toBe(toISO(addBusinessDays(asOfDate, 15 - 1)));
  });
});

describe("cascade regression baseline", () => {
  it("still pushes a dependent task's forecast off a delayed predecessor's forecastEnd", () => {
    const pred = task({ id: 1, durBusinessDays: 20, progress: 44, elapsedDays: 10 }); // flagged, see above
    const succTask: Task = {
      ...BASE,
      id: 2,
      estimationHours: 5 * 8, // 5 business days
      progress: 0,
      startDateOverride: null,
      dependsOn: [1],
    };
    const result = computeTaskSchedule({ tasks: [pred.t, succTask], resources: [RESOURCE], asOf: pred.asOf });
    const predSt = result.get(1)!;
    const succSt = result.get(2)!;

    expect(predSt.forecastEnd).not.toBeNull();
    const expectedStart = rollForward(addBusinessDays(new Date(predSt.forecastEnd! + "T00:00:00"), 1));
    const expectedEnd = addBusinessDays(expectedStart, succSt.durationDays - 1);

    expect(succSt.forecastStart).toBe(toISO(expectedStart));
    expect(succSt.forecastEnd).toBe(toISO(expectedEnd));
  });
});
