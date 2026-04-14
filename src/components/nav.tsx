"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/match-centre", label: "Match Centre" },
  { href: "/table", label: "League Table" },
  { href: "/supercomputer", label: "Supercomputer" },
  { href: "/super4", label: "Super 4" },
  { href: "/chat", label: "Chat" },
  { href: "/stats-hub", label: "Stats Hub" },
  { href: "/profiles", label: "Profiles" },
  { href: "/login", label: "Login" },
  { href: "/bracket", label: "Gauntlet" },
  { href: "/rules", label: "Rules" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav-shell fade-in-up sticky top-2 z-20 overflow-x-auto p-2 backdrop-blur-md">
      <div className="flex min-w-max gap-2">
      {links.map((link) => (
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
    </nav>
  );
}
