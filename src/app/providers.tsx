"use client";

import { HeroUIProvider } from "@heroui/react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/lib/theme";
import { useRouter } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <SessionProvider>
      <ThemeProvider>
        <HeroUIProvider navigate={router.push}>
          {children}
        </HeroUIProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
