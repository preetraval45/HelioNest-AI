"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat",      label: "AI Chat" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="frosted-nav sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 shrink-0" aria-label="HelioNest AI home">
          <span className="text-lg font-bold tracking-tight text-th-solar">HelioNest</span>
          <span className="text-lg font-bold tracking-tight text-th-text-2">AI</span>
        </Link>

        {/* Center nav links */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-th-solar/10 text-th-solar"
                    : "text-th-text-2 hover:bg-white/5 hover:text-th-text"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden sm:block px-3 py-1.5 rounded-lg text-sm font-medium text-th-text-2 hover:text-th-text transition-colors duration-200"
          >
            Log in
          </Link>
          <Link href="/register" className="btn-solar px-4 py-1.5 rounded-lg text-sm">
            Sign up
          </Link>
        </div>

      </div>
    </nav>
  );
}
