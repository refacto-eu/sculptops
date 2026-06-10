import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { servers, playbooks, executions, inventories, schedules, sshKeys } from "@/lib/db/schema";
import { eq, count, desc, and, gte, lt, sql, avg } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { ExecutionTrendChart } from "@/components/dashboard/execution-trend";
import { TopPlaybooksChart } from "@/components/dashboard/top-playbooks-chart";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import {
  Server, BookOpen, Play, CheckCircle, Calendar,
  Wifi, WifiOff, TrendingUp, TrendingDown, Minus,
  Database, Key, Clock,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function fmtDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const VALID_PERIODS = [3, 7, 14, 30, 90] as const;
type Period = (typeof VALID_PERIODS)[number];

function parsePeriod(raw: string | undefined): Period {
  const n = Number(raw);
  return (VALID_PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

async function getStats(orgId: string, period: Period) {
  const now = new Date();
  const ms = period * 24 * 60 * 60 * 1000;
  const periodAgo = new Date(now.getTime() - ms);
  const prevPeriodAgo = new Date(now.getTime() - 2 * ms);
  // Trend chart uses the selected period (capped at 90 for readability)
  const trendDays = period;

  // Keep legacy aliases for the SQL queries below
  const thirtyDaysAgo = periodAgo;
  const sixtyDaysAgo = prevPeriodAgo;
  const fourteenDaysAgo = periodAgo;

  const [
    // Infrastructure counts
    serverRows,
    serverReachableRows,
    serverUnreachableRows,
    playbookCountRows,
    inventoryCountRows,
    scheduleCountRows,
    scheduleEnabledRows,
    sshKeyCountRows,

    // KPI — this period (last 30 days)
    execThisPeriodRows,
    successThisPeriodRows,
    failedThisPeriodRows,
    avgDurationRows,
    runningNowRows,

    // KPI — previous period (30–60 days ago)
    execPrevPeriodRows,
    successPrevPeriodRows,

    // Recent executions
    recentExecutions,
  ] = await Promise.all([
    db.select({ count: count() }).from(servers).where(eq(servers.organizationId, orgId)),
    db.select({ count: count() }).from(servers).where(and(eq(servers.organizationId, orgId), eq(servers.status, "reachable"))),
    db.select({ count: count() }).from(servers).where(and(eq(servers.organizationId, orgId), eq(servers.status, "unreachable"))),
    db.select({ count: count() }).from(playbooks).where(eq(playbooks.organizationId, orgId)),
    db.select({ count: count() }).from(inventories).where(eq(inventories.organizationId, orgId)),
    db.select({ count: count() }).from(schedules).where(eq(schedules.organizationId, orgId)),
    db.select({ count: count() }).from(schedules).where(and(eq(schedules.organizationId, orgId), eq(schedules.enabled, true))),
    db.select({ count: count() }).from(sshKeys).where(eq(sshKeys.organizationId, orgId)),

    db.select({ count: count() }).from(executions).where(and(eq(executions.organizationId, orgId), gte(executions.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(executions).where(and(eq(executions.organizationId, orgId), gte(executions.createdAt, thirtyDaysAgo), eq(executions.status, "success"))),
    db.select({ count: count() }).from(executions).where(and(eq(executions.organizationId, orgId), gte(executions.createdAt, thirtyDaysAgo), eq(executions.status, "failed"))),
    db.select({ value: avg(sql<number>`EXTRACT(EPOCH FROM (finished_at - started_at))`) })
      .from(executions)
      .where(and(eq(executions.organizationId, orgId), eq(executions.status, "success"), gte(executions.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(executions).where(and(eq(executions.organizationId, orgId), sql`status IN ('running', 'pending')`)),

    db.select({ count: count() }).from(executions).where(and(eq(executions.organizationId, orgId), gte(executions.createdAt, sixtyDaysAgo), lt(executions.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(executions).where(and(eq(executions.organizationId, orgId), gte(executions.createdAt, sixtyDaysAgo), lt(executions.createdAt, thirtyDaysAgo), eq(executions.status, "success"))),

    db.query.executions.findMany({
      where: eq(executions.organizationId, orgId),
      orderBy: [desc(executions.createdAt)],
      limit: 8,
      with: {
        playbook: { columns: { id: true, name: true } },
        inventory: { columns: { id: true, name: true } },
      },
    }),
  ]);

  // 14-day trend
  const trendRaw = await db.execute(sql`
    SELECT
      (created_at AT TIME ZONE 'UTC')::date::text AS day,
      COUNT(*) FILTER (WHERE status = 'success')::int AS success,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM executions
    WHERE organization_id = ${orgId}
      AND created_at >= ${fourteenDaysAgo.toISOString()}
    GROUP BY (created_at AT TIME ZONE 'UTC')::date
    ORDER BY day ASC
  `);

  const trendMap = new Map<string, { success: number; failed: number }>();
  for (const row of trendRaw as unknown as Array<{ day: string; success: number; failed: number }>) {
    trendMap.set(row.day, { success: Number(row.success), failed: Number(row.failed) });
  }
  const trend = lastNDays(trendDays).map((d) => ({
    date: d,
    success: trendMap.get(d)?.success ?? 0,
    failed: trendMap.get(d)?.failed ?? 0,
  }));

  // Top 5 playbooks (last 30 days)
  const topRaw = await db.execute(sql`
    SELECT
      COALESCE(p.name, 'Deleted playbook') AS name,
      COUNT(e.id)::int AS runs,
      COUNT(e.id) FILTER (WHERE e.status = 'success')::int AS success
    FROM executions e
    LEFT JOIN playbooks p ON e.playbook_id = p.id
    WHERE e.organization_id = ${orgId}
      AND e.created_at >= ${thirtyDaysAgo.toISOString()}
    GROUP BY p.name
    ORDER BY runs DESC
    LIMIT 5
  `);
  const topPlaybooks = (topRaw as unknown as Array<{ name: string; runs: number; success: number }>).map((r) => ({
    name: r.name,
    runs: Number(r.runs),
    successRate: r.runs > 0 ? Math.round((Number(r.success) / Number(r.runs)) * 100) : 0,
  }));

  // Derived KPIs
  const execThis = Number(execThisPeriodRows[0].count);
  const execPrev = Number(execPrevPeriodRows[0].count);
  const successThis = Number(successThisPeriodRows[0].count);
  const successPrev = Number(successPrevPeriodRows[0].count);
  const failedThis = Number(failedThisPeriodRows[0].count);

  const successRate = execThis > 0 ? Math.round((successThis / execThis) * 100) : null;
  const successRatePrev = execPrev > 0 ? Math.round((successPrev / execPrev) * 100) : null;
  const avgDurSec = avgDurationRows[0].value ? Number(avgDurationRows[0].value) : null;
  const execDelta = execPrev > 0 ? Math.round(((execThis - execPrev) / execPrev) * 100) : null;
  const rateDelta = successRate !== null && successRatePrev !== null ? successRate - successRatePrev : null;

  return {
    period,
    infra: {
      servers: Number(serverRows[0].count),
      serverReachable: Number(serverReachableRows[0].count),
      serverUnreachable: Number(serverUnreachableRows[0].count),
      playbooks: Number(playbookCountRows[0].count),
      inventories: Number(inventoryCountRows[0].count),
      schedules: Number(scheduleCountRows[0].count),
      schedulesEnabled: Number(scheduleEnabledRows[0].count),
      sshKeys: Number(sshKeyCountRows[0].count),
    },
    kpi: {
      execThis,
      execDelta,
      successRate,
      rateDelta,
      failedThis,
      avgDurSec,
      runningNow: Number(runningNowRows[0].count),
    },
    trend,
    topPlaybooks,
    recentExecutions,
  };
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) return <span className="flex items-center gap-0.5 text-xs text-th-subtle"><Minus className="h-3 w-3" />0%</span>;
  const up = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{delta}%
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const { period: pParam } = await searchParams;
  const period = parsePeriod(pParam);
  const { infra, kpi, trend, topPlaybooks, recentExecutions } = await getStats(ctx.org.id, period);
  const periodLabel = `last ${period} days`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${ctx.org.name}`}
        action={<Suspense><PeriodSelector /></Suspense>}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Executions */}
        <div className="bg-card border border-border-base rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-th-muted">Executions</p>
            <Play className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-th-primary">{kpi.execThis}</p>
          <div className="mt-1 flex items-center gap-2">
            <DeltaBadge delta={kpi.execDelta} />
            <span className="text-xs text-th-subtle">vs prev {period}d</span>
          </div>
        </div>

        {/* Success rate */}
        <div className="bg-card border border-border-base rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-th-muted">Success Rate</p>
            <CheckCircle className="h-4 w-4 text-yellow-400" />
          </div>
          <p className="text-3xl font-bold text-th-primary">{kpi.successRate !== null ? `${kpi.successRate}%` : "—"}</p>
          <div className="mt-1 flex items-center gap-2">
            <DeltaBadge delta={kpi.rateDelta} />
            {kpi.failedThis > 0 && <span className="text-xs text-red-400">{kpi.failedThis} failed</span>}
          </div>
        </div>

        {/* Avg duration */}
        <div className="bg-card border border-border-base rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-th-muted">Avg Duration</p>
            <Clock className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-th-primary">
            {kpi.avgDurSec !== null ? fmtDuration(kpi.avgDurSec) : "—"}
          </p>
          <p className="text-xs text-th-subtle mt-1">successful runs only</p>
        </div>

        {/* Running / Schedules */}
        <div className="bg-card border border-border-base rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-th-muted">Active Schedules</p>
            <Calendar className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-th-primary">{infra.schedulesEnabled}</p>
          <div className="mt-1 flex items-center gap-2">
            {kpi.runningNow > 0 && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {kpi.runningNow} running
              </span>
            )}
            <span className="text-xs text-th-subtle">of {infra.schedules} total</span>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Trend */}
        <div className="lg:col-span-2 bg-card border border-border-base rounded-xl p-5">
          <h2 className="text-sm font-semibold text-th-primary mb-4">Execution Trend — {periodLabel}</h2>
          <ExecutionTrendChart data={trend} />
        </div>

        {/* Top playbooks */}
        <div className="bg-card border border-border-base rounded-xl p-5">
          <h2 className="text-sm font-semibold text-th-primary mb-4">Top Playbooks — {periodLabel}</h2>
          <TopPlaybooksChart data={topPlaybooks} />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Infrastructure summary */}
        <div className="bg-card border border-border-base rounded-xl p-5">
          <h2 className="text-sm font-semibold text-th-primary mb-4">Infrastructure</h2>
          <div className="space-y-3">
            <Link href="/dashboard/servers" className="flex items-center justify-between group">
              <div className="flex items-center gap-2 text-sm text-th-secondary group-hover:text-th-primary transition-colors">
                <Server className="h-4 w-4 text-blue-400" />
                Servers
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-th-primary">{infra.servers}</span>
                {infra.servers > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {infra.serverReachable > 0 && (
                      <span className="flex items-center gap-0.5 text-emerald-400">
                        <Wifi className="h-3 w-3" />{infra.serverReachable}
                      </span>
                    )}
                    {infra.serverUnreachable > 0 && (
                      <span className="flex items-center gap-0.5 text-red-400">
                        <WifiOff className="h-3 w-3" />{infra.serverUnreachable}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
            <Link href="/dashboard/inventories" className="flex items-center justify-between group">
              <div className="flex items-center gap-2 text-sm text-th-secondary group-hover:text-th-primary transition-colors">
                <Database className="h-4 w-4 text-orange-400" />
                Inventories
              </div>
              <span className="text-sm font-semibold text-th-primary">{infra.inventories}</span>
            </Link>
            <Link href="/dashboard/playbooks" className="flex items-center justify-between group">
              <div className="flex items-center gap-2 text-sm text-th-secondary group-hover:text-th-primary transition-colors">
                <BookOpen className="h-4 w-4 text-purple-400" />
                Playbooks
              </div>
              <span className="text-sm font-semibold text-th-primary">{infra.playbooks}</span>
            </Link>
            <Link href="/dashboard/ssh-keys" className="flex items-center justify-between group">
              <div className="flex items-center gap-2 text-sm text-th-secondary group-hover:text-th-primary transition-colors">
                <Key className="h-4 w-4 text-yellow-400" />
                SSH Keys
              </div>
              <span className="text-sm font-semibold text-th-primary">{infra.sshKeys}</span>
            </Link>
            <Link href="/dashboard/schedules" className="flex items-center justify-between group">
              <div className="flex items-center gap-2 text-sm text-th-secondary group-hover:text-th-primary transition-colors">
                <Calendar className="h-4 w-4 text-pink-400" />
                Schedules
              </div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-th-primary">
                {infra.schedules}
                {infra.schedulesEnabled > 0 && (
                  <span className="text-xs font-normal text-emerald-400">({infra.schedulesEnabled} on)</span>
                )}
              </div>
            </Link>
          </div>
        </div>

        {/* Recent executions */}
        <div className="lg:col-span-2 bg-card border border-border-base rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border-base flex items-center justify-between">
            <h2 className="text-sm font-semibold text-th-primary">Recent Executions</h2>
            <Link href="/dashboard/executions" className="text-xs text-th-subtle hover:text-th-secondary transition-colors">
              View all →
            </Link>
          </div>
          {recentExecutions.length === 0 ? (
            <div className="py-10 text-center text-th-subtle text-sm">
              No executions yet.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-base/60">
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-th-subtle">Playbook</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-th-subtle">Inventory</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-th-subtle">Status</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-th-subtle">When</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-th-subtle">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {recentExecutions.map((exec) => {
                  const dur = exec.startedAt && exec.finishedAt
                    ? fmtDuration((new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000)
                    : exec.startedAt ? "running…" : "—";
                  return (
                    <tr key={exec.id} className="hover:bg-input/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-th-primary font-medium">
                        {(exec as { playbook?: { name: string } }).playbook?.name ?? <span className="text-th-subtle">Deleted</span>}
                      </td>
                      <td className="px-5 py-3 text-sm text-th-muted">
                        {(exec as { inventory?: { name: string } }).inventory?.name ?? <span className="text-th-subtle">—</span>}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={exec.status} /></td>
                      <td className="px-5 py-3 text-sm text-th-subtle">{formatDate(exec.createdAt)}</td>
                      <td className="px-5 py-3 text-sm font-mono text-th-subtle">{dur}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
