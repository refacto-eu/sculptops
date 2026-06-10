"use client";

import { AlertCircle } from "lucide-react";

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-400 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );
}
