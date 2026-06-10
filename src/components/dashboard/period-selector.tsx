"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PERIODS = [
  { label: "3d", value: 3 },
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const DEFAULT_PERIOD = 30;

export function PeriodSelector() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("period");
  const active = PERIODS.some(p => p.value === Number(raw)) ? Number(raw) : DEFAULT_PERIOD;

  return (
    <div className="flex items-center gap-1 bg-input border border-border-base rounded-lg p-1">
      {PERIODS.map(({ label, value }) => {
        const isActive = active === value;
        const params = new URLSearchParams(searchParams.toString());
        if (value === DEFAULT_PERIOD) {
          params.delete("period");
        } else {
          params.set("period", String(value));
        }
        const href = `?${params.toString()}` || "?";
        return (
          <Link
            key={value}
            href={href}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive
                ? "bg-card text-th-primary shadow-sm"
                : "text-th-muted hover:text-th-primary"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
