import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/table", label: "League Table" },
  { href: "/bracket", label: "Bracket" },
  { href: "/rules", label: "Rules" },
];

export function Nav() {
  return (
    <nav className="fade-in-up surface-card flex flex-wrap gap-2 p-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="ghost-button rounded-lg px-4 py-2 text-sm font-semibold"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
