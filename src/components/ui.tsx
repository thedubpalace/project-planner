"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { tagHue } from "@/lib/tags";
import type { TaskStatus } from "@/lib/types";

// --- date helpers -------------------------------------------------------------

export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso + "T00:00:00"), withYear ? "MMM d, yyyy" : "MMM d");
  } catch {
    return iso;
  }
}

// Names the shifted tasks inline instead of just a count, so a cascade's
// impact is visible where the edit happened rather than requiring a tab
// switch to the Timeline to see which tasks moved.
export function fmtShifted(names: string[], max = 3): string {
  if (names.length === 0) return "";
  const shown = names.slice(0, max).join(", ");
  const rest = names.length - max;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

// --- Button -------------------------------------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[filter,border-color,color] duration-150 cursor-pointer select-none";
  const sizes =
    size === "sm" ? "h-8 px-3 text-[12px] min-w-[64px]" : "h-9 px-4 text-[13px] min-w-[72px]";
  const styles: Record<string, string> = {
    primary: "text-[var(--text-on-accent)] border-0 hover:brightness-110",
    secondary:
      "bg-transparent text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-focus)]",
    danger:
      "bg-transparent text-[var(--status-danger-text)] border border-[var(--status-danger-border)] hover:brightness-110",
    ghost: "bg-transparent text-[var(--text-secondary)] border-0 hover:text-[var(--text-primary)]",
  };
  return (
    <button
      className={`${base} ${sizes} ${styles[variant]} ${disabled || loading ? "opacity-45 pointer-events-none" : ""} ${className}`}
      style={variant === "primary" ? { background: "var(--accent)" } : undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// --- Status Pill --------------------------------------------------------------

export type PillVariant =
  | "on-track"
  | "at-risk"
  | "over-deadline"
  | "unassigned"
  | "overallocated"
  | "behind-pace"
  | "not-started"
  | "in-progress"
  | "done"
  | "done-late";

const PILL: Record<PillVariant, { label: string; dot: string; bg: string; text: string; border: string }> = {
  "on-track": { label: "On track", dot: "●", bg: "--status-good-bg", text: "--status-good-text", border: "--status-good-border" },
  done: { label: "Done", dot: "✓", bg: "--status-good-bg", text: "--status-good-text", border: "--status-good-border" },
  "at-risk": { label: "At risk", dot: "●", bg: "--status-warning-bg", text: "--status-warning-text", border: "--status-warning-border" },
  "over-deadline": { label: "Over deadline", dot: "●", bg: "--status-danger-bg", text: "--status-danger-text", border: "--status-danger-border" },
  unassigned: { label: "Unassigned", dot: "⚠", bg: "--status-danger-bg", text: "--status-danger-text", border: "--status-danger-border" },
  overallocated: { label: "Overallocated", dot: "●", bg: "--status-danger-bg", text: "--status-danger-text", border: "--status-danger-border" },
  "behind-pace": { label: "Behind pace", dot: "●", bg: "--status-warning-bg", text: "--status-warning-text", border: "--status-warning-border" },
  "done-late": { label: "Done late", dot: "●", bg: "--status-danger-bg", text: "--status-danger-text", border: "--status-danger-border" },
  "not-started": { label: "Not started", dot: "○", bg: "--status-neutral-bg", text: "--status-neutral-text", border: "--status-neutral-border" },
  "in-progress": { label: "In progress", dot: "◐", bg: "--accent-dim", text: "--accent-text", border: "--accent-border" },
};

export function StatusPill({ variant, label }: { variant: PillVariant; label?: string }) {
  const p = PILL[variant];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 h-[22px] text-[11px] font-medium whitespace-nowrap border"
      style={{
        background: `var(${p.bg})`,
        color: `var(${p.text})`,
        borderColor: `var(${p.border})`,
      }}
    >
      <span className="text-[8px] leading-none">{p.dot}</span>
      {label ?? p.label}
    </span>
  );
}

// Derive a task's pill variant from its scheduled state.
export function taskPill(
  status: TaskStatus,
  unassigned: boolean,
  overDeadline: boolean,
  behindPace = false,
): PillVariant {
  if (overDeadline) return "over-deadline";
  if (unassigned && status !== "done") return "unassigned";
  if (behindPace) return "behind-pace";
  if (status === "done") return "done";
  if (status === "in_progress") return "in-progress";
  return "not-started";
}

// --- Skill Tag Chip -----------------------------------------------------------

export function SkillChip({
  tag,
  onRemove,
  interactive,
  active,
  onClick,
}: {
  tag: string;
  onRemove?: () => void;
  interactive?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const hue = tagHue(tag);
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded h-5 px-2 text-[11px] font-medium border ${
        interactive ? "cursor-pointer" : ""
      }`}
      style={{
        background: `var(--tag-${hue}-bg)`,
        color: `var(--tag-${hue}-text)`,
        borderColor: active ? `var(--tag-${hue}-text)` : `var(--tag-${hue}-border)`,
      }}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 opacity-70 hover:opacity-100 cursor-pointer"
          aria-label={`Remove ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

// --- Progress bar / Workload bar ----------------------------------------------

export function ProgressBar({ pct, width = 120 }: { pct: number; width?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full overflow-hidden shrink-0"
        style={{ width, background: "var(--bg-surface-hi)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: "var(--accent)" }}
        />
      </div>
      <span className="text-[11px] mono" style={{ color: "var(--text-muted)" }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export function WorkloadBar({ hours, capacity, width = 100 }: { hours: number; capacity: number; width?: number }) {
  const pct = capacity > 0 ? (hours / capacity) * 100 : 0;
  const color =
    pct > 100 ? "--status-danger-text" : pct >= 70 ? "--status-warning-text" : "--status-good-text";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full overflow-hidden shrink-0"
        style={{
          width,
          background: "var(--bg-surface-hi)",
          outline: pct > 100 ? "1px solid var(--status-danger-border)" : "none",
        }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: `var(${color})` }}
        />
      </div>
      <span className="text-[11px] mono whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
        {Math.round(hours)}h / {Math.round(capacity)}h
      </span>
    </div>
  );
}

// --- Modal --------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--scrim-modal)" }}
      onClick={onClose}
    >
      <div
        className="scale-in rounded-[10px] border"
        style={{ width, maxWidth: "100%", background: "var(--bg-modal)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 border-b text-[16px] font-semibold"
          style={{ borderColor: "var(--border-divider)" }}
        >
          {title}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// --- Drawer -------------------------------------------------------------------

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "var(--scrim-drawer)" }} onClick={onClose}>
      <div
        className="drawer-in h-full overflow-y-auto border-l flex flex-col"
        style={{ width, maxWidth: "100%", background: "var(--bg-modal)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-4 border-b text-[16px] font-semibold flex items-center justify-between sticky top-0 z-10"
          style={{ borderColor: "var(--border-divider)", background: "var(--bg-modal)" }}
        >
          {title}
          <button onClick={onClose} className="cursor-pointer opacity-60 hover:opacity-100 text-lg" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- Toast --------------------------------------------------------------------

type Toast = { id: number; message: string; kind: "success" | "error" | "info" };
const ToastCtx = createContext<(message: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="fade-in w-[280px] rounded-lg border px-4 py-3 text-[13px]"
            style={{
              background: "var(--bg-modal)",
              borderColor: "var(--border-default)",
              boxShadow: "var(--shadow-card)",
              color:
                t.kind === "success"
                  ? "var(--status-good-text)"
                  : t.kind === "error"
                    ? "var(--status-danger-text)"
                    : "var(--text-primary)",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// --- Field --------------------------------------------------------------------

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[12px] max-w-[65ch]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
