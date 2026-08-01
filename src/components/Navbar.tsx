"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./ui";

export function Navbar() {
  const pathname = usePathname();
  const onDashboard = pathname === "/";
  const onPortfolio = pathname.startsWith("/portfolio");
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
      className="h-14 sticky top-0 z-30 flex items-center gap-3 sm:gap-8 px-3 sm:px-6 border-b"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-divider)",
        boxShadow: "var(--shadow-nav)",
        // Forces its own compositing layer/stacking context — on some
        // mobile browsers, static page content scrolling up from below
        // could intermittently paint on top of a sticky element instead of
        // under it when the sticky element relies on z-index alone.
        isolation: "isolate",
      }}
    >
      {/* h-14 is a fixed height — the wordmark must never wrap onto a second
          line, since wrapped text overflows straight past this fixed box
          (default overflow is visible) and bleeds into whatever's rendered
          right below the nav instead of being clipped or growing the bar.
          Tighter gaps/padding on narrow screens instead of overflow-x-auto —
          a scrollbar inside the topbar itself reads as broken chrome, not
          a real affordance. */}
      <Link href="/" className="shrink-0 whitespace-nowrap text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
        project-planner
      </Link>
      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        <Link href="/" className={linkCls(onDashboard)}>
          Projects
        </Link>
        <Link href="/portfolio" className={linkCls(onPortfolio)}>
          Portfolio
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
