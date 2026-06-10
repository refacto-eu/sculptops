"use client";

/**
 * Tip — thin wrapper around HeroUI Tooltip that guarantees a solid dark
 * background via classNames (CSS global selectors are unreliable with
 * HeroUI v2.8 because the tooltip portal slot name varies by version).
 */
import { Tooltip } from "@heroui/react";
import type { TooltipProps } from "@heroui/react";

const TIP_CLASSES = {
  content: "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-lg rounded-lg text-xs font-medium px-2 py-1",
};

export function Tip({ children, ...props }: TooltipProps) {
  return (
    <Tooltip {...props} classNames={TIP_CLASSES}>
      {children}
    </Tooltip>
  );
}
