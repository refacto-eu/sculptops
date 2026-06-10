"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Server, Key, BookOpen, List, Play, LayoutDashboard,
  Settings, LogOut, Shield, Clock, GitBranch, Webhook, Users, Lock,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard",   href: "/dashboard",             icon: LayoutDashboard, exact: true },
  { name: "Servers",     href: "/dashboard/servers",     icon: Server,          exact: false },
  { name: "SSH Keys",    href: "/dashboard/ssh-keys",    icon: Key,             exact: false },
  { name: "Vault",       href: "/dashboard/vault",       icon: Lock,            exact: false },
  { name: "Inventories", href: "/dashboard/inventories", icon: List,            exact: false },
  { name: "Playbooks",   href: "/dashboard/playbooks",   icon: BookOpen,        exact: false },
  { name: "Executions",  href: "/dashboard/executions",  icon: Play,            exact: false },
  { name: "Schedules",   href: "/dashboard/schedules",   icon: Clock,           exact: false },
  { name: "Workflows",   href: "/dashboard/workflows",   icon: GitBranch,       exact: false },
  { name: "Webhooks",    href: "/dashboard/webhooks",    icon: Webhook,         exact: false },
  { name: "Members",     href: "/dashboard/members",     icon: Users,           exact: false },
  { name: "Audit Log",   href: "/dashboard/audit",       icon: Shield,          exact: false },
];

const secondaryNav = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col bg-page border-r border-border-base">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-base">
        <img src="/brand/SculptOps_icon_light_mode.svg" alt="" className="h-8 w-8 rounded-lg shrink-0" />
        <img src="/brand/ScultOps_logo_dark_mode.png" alt="SculptOps" className="h-6 object-contain" style={{ transform: "translateY(2px)" }} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "text-th-muted hover:bg-card hover:text-th-primary"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-th-subtle mb-2">
            Account
          </p>
          <ul className="space-y-1">
            {secondaryNav.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith(item.href)
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "text-th-muted hover:bg-card hover:text-th-primary"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              </li>
            ))}
            <li>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-th-muted hover:bg-card hover:text-th-primary transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>
  );
}
