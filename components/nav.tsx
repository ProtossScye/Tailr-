"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { BetsIcon, ChartIcon, HomeIcon, LogoMark, PlusIcon, UserIcon } from "./icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavEntry {
  href: string;
  label: string;
  Icon: Icon;
  /** The visually prominent central action. */
  primary?: boolean;
}

/** Five tabs, in this order. Create sits in the middle. */
export const NAV: readonly NavEntry[] = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/bets", label: "Bets", Icon: BetsIcon },
  { href: "/create", label: "Create", Icon: PlusIcon, primary: true },
  { href: "/analytics", label: "Analytics", Icon: ChartIcon },
  { href: "/profile", label: "Profile", Icon: UserIcon },
];

/** Which tab owns a path. Sub-pages such as /bets/new or /bets/123 keep the Bets tab lit. */
export function activeHref(pathname: string): string | null {
  const match = NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (match) return match.href;
  // The bell lives in the header, so its page belongs to Home.
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return "/dashboard";
  return null;
}

export function BottomNav() {
  const active = activeHref(usePathname());
  return (
    <nav className="nav-bottom" aria-label="Main">
      <ul>
        {NAV.map(({ href, label, Icon, primary }) => {
          const current = active === href ? "page" : undefined;
          return (
            <li key={href}>
              {primary ? (
                <Link href={href} className="nav-create" aria-current={current}>
                  <span className="disc">
                    <Icon />
                  </span>
                  <span className="label">{label}</span>
                </Link>
              ) : (
                <Link href={href} className="nav-item" aria-current={current}>
                  <Icon />
                  <span>{label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const active = activeHref(usePathname());
  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="logo" aria-label="Tailr home">
        <span className="logo-mark">
          <LogoMark />
        </span>
        Tailr
      </Link>
      <nav aria-label="Main">
        <ul>
          {NAV.map(({ href, label, Icon, primary }) => (
            <li key={href}>
              <Link
                href={href}
                className={primary ? "side-item side-create" : "side-item"}
                aria-current={active === href ? "page" : undefined}
              >
                <Icon />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
