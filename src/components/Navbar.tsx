"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./ui";

export function Navbar() {
  const pathname = usePathname();
  const onDashboard = pathname === "/";
  const onResources = pathname.startsWith("/resources");

  const cta = onDashboard
    ? { label: "+ New Project", event: "planner:new-project" }
    : onResources
      ? { label: "+ New Resource", event: "planner:new-resource" }
      : null;

  const linkCls = (active: boolean) =>
    `text-[13px] font-medium h-[56px] flex items-center border-b-2 transition-colors ${
      active
        ? "text-[var(--text-primary)] border-[var(--accent)]"
        : "text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]"
    }`;

  return (
    <nav
      className="h-14 sticky top-0 z-30 flex items-center gap-8 px-6 border-b"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-divider)" }}
    >
      <Link href="/" className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
        project-planner
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/" className={linkCls(onDashboard)}>
          Projects
        </Link>
        <Link href="/resources" className={linkCls(onResources)}>
          Resources
        </Link>
      </div>
      <div className="ml-auto">
        {cta && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent(cta.event))}
          >
            {cta.label}
          </Button>
        )}
      </div>
    </nav>
  );
}
