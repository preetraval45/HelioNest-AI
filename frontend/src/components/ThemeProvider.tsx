"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to "dark" to match the server-side class set by the inline script
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Read whatever the anti-flash inline script already set on <html>
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setThemeState(current);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    try { localStorage.setItem("hn-theme", theme); } catch { /* SSR safety */ }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggle: () => setThemeState((p) => (p === "dark" ? "light" : "dark")),
      setTheme: setThemeState,
    }),
    [theme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
