"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/table", label: "League Table" },
  { href: "/bracket", label: "Bracket" },
  { href: "/rules", label: "Rules" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fade-in-up surface-card flex flex-wrap gap-2 p-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${
            pathname === link.href
              ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-[0_0_0_2px_rgba(34,211,238,0.25)]"
              : ""
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
