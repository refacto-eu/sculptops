"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeCtx = createContext<{
  theme: Theme | undefined;
  setTheme: (t: Theme) => void;
}>({ theme: undefined, setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme | undefined>(undefined);

  // Read saved preference once on mount
  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    setThemeState(saved ?? "dark");
  }, []);

  // Apply class to <html> and persist whenever theme changes
  useEffect(() => {
    if (!theme) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
