"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useTheme } from "@/lib/theme";

interface TrendPoint {
  date: string;
  success: number;
  failed: number;
}

interface Props {
  data: TrendPoint[];
}

function fmt(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ExecutionTrendChart({ data }: Props) {
  const { theme } = useTheme();
  const dark = theme !== "light";
  const grid = dark ? "#3f3f46" : "#e2e8f0";
  const tick = dark ? "#71717a" : "#64748b";
  const tooltipBg = dark ? "#18181b" : "#f8fafc";
  const tooltipBorder = dark ? "#3f3f46" : "#e2e8f0";
  const tooltipLabel = dark ? "#a1a1aa" : "#64748b";
  const tooltipItem = dark ? "#e4e4e7" : "#1e293b";
  const legend = dark ? "#a1a1aa" : "#64748b";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmt}
          tick={{ fill: tick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: tick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: tooltipLabel, marginBottom: 4 }}
          labelFormatter={(label) => fmt(String(label))}
          itemStyle={{ color: tooltipItem }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: legend, paddingTop: 8 }}
          formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
        />
        <Area type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} fill="url(#gSuccess)" />
        <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} fill="url(#gFailed)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
