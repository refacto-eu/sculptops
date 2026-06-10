"use client";

import { Chip } from "@heroui/react";
import { getStatusColor } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Chip
      color={getStatusColor(status)}
      size="sm"
      variant="flat"
      className="capitalize"
    >
      {status}
    </Chip>
  );
}
