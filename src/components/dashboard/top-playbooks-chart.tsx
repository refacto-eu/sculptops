"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTheme } from "@/lib/theme";

interface PlaybookStat {
  name: string;
  runs: number;
  successRate: number;
}

interface Props {
  data: PlaybookStat[];
}

function truncate(s: string, n = 22) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function TopPlaybooksChart({ data }: Props) {
  const { theme } = useTheme();
  const dark = theme !== "light";
  const grid = dark ? "#3f3f46" : "#e2e8f0";
  const tickMuted = dark ? "#71717a" : "#64748b";
  const tickSecondary = dark ? "#a1a1aa" : "#475569";
  const cursor = dark ? "#27272a" : "#f1f5f9";
  const tooltipBg = dark ? "#18181b" : "#f8fafc";
  const tooltipBorder = dark ? "#3f3f46" : "#e2e8f0";
  const tooltipLabel = dark ? "#e4e4e7" : "#1e293b";

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-th-subtle text-sm">
        No executions in the last 30 days
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: tickMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tickFormatter={(v) => truncate(v)}
          tick={{ fill: tickSecondary, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: cursor }}
          contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: tooltipLabel, marginBottom: 4 }}
          formatter={(value, _name, entry) => [
            `${value ?? 0} runs — ${(entry.payload as { successRate: number }).successRate}% success`,
            "",
          ]}
        />
        <Bar dataKey="runs" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.successRate >= 80 ? "#10b981" : entry.successRate >= 50 ? "#f59e0b" : "#ef4444"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
