"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavProps = {
  isAuthenticated: boolean;
  isAdmin: boolean;
};

export function Nav({ isAuthenticated, isAdmin }: NavProps) {
  const pathname = usePathname();
  const disableStickyNav = pathname === "/gambling";
  const primaryLinks = [
    { href: "/", label: "Home" },
    { href: "/fixtures", label: "Fixtures" },
    { href: "/match-centre", label: "Match Centre" },
    { href: "/table", label: "League Table" },
    { href: "/supercomputer", label: "Supercomputer" },
    { href: "/bracket", label: "Gauntlet" },
  ];
  const secondaryLinks = [
    { href: "/stats-hub", label: "Stats Hub" },
    { href: "/profiles", label: "Profiles" },
    { href: "/rules", label: "Rules" },
  ];
  const memberLinks = [
    { href: "/super4", label: "Super 4" },
    { href: "/gambling", label: "Gambling" },
    { href: "/chat", label: "Chat" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <nav
      className={`nav-shell fade-in-up p-2 backdrop-blur-md ${
        disableStickyNav ? "relative" : "sticky top-2 z-20"
      }`}
    >
      <div className="flex flex-wrap gap-2">
        {primaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className="ghost-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
        <span className="muted px-1 text-[10px] font-semibold uppercase tracking-widest">More</span>
        {secondaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className="nav-sub-button rounded-md px-3 py-1.5 text-xs font-semibold"
          >
            {link.label}
          </Link>
        ))}
      </div>
      {isAuthenticated ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
          <span className="muted px-1 text-[10px] font-semibold uppercase tracking-widest">Member</span>
          {memberLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="nav-sub-button rounded-md px-3 py-1.5 text-xs font-semibold"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
