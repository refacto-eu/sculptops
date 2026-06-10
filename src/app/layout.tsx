import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SculptOps — Ansible Web Interface",
  description: "Open-source GUI for Ansible automation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html:
            `try{document.documentElement.className=localStorage.getItem("theme")||"dark"}catch(e){}`
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
