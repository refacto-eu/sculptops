"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  isLoading?: boolean;
}

function pageNumbers(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const nums: (number | "…")[] = [1];
  if (page > 3) nums.push("…");
  for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) nums.push(i);
  if (page < total - 2) nums.push("…");
  nums.push(total);
  return nums;
}

export function Pager({ page, totalPages, onPageChange, isLoading }: Props) {
  if (totalPages <= 1) return null;

  const btnBase = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-center gap-1 select-none">
      <button
        disabled={page <= 1 || isLoading}
        onClick={() => onPageChange(page - 1)}
        className={cn(btnBase, "text-th-muted hover:bg-input hover:text-th-primary")}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pageNumbers(page, totalPages).map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="flex h-8 w-8 items-center justify-center text-th-subtle text-sm">…</span>
        ) : (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            disabled={isLoading}
            className={cn(
              btnBase,
              n === page
                ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                : "text-th-muted hover:bg-input hover:text-th-primary"
            )}
          >
            {n}
          </button>
        )
      )}

      <button
        disabled={page >= totalPages || isLoading}
        onClick={() => onPageChange(page + 1)}
        className={cn(btnBase, "text-th-muted hover:bg-input hover:text-th-primary")}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
