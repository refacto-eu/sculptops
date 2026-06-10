"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "@heroui/react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-input mb-4">
        <Icon className="h-8 w-8 text-th-muted" />
      </div>
      <h3 className="text-lg font-semibold text-th-primary mb-1">{title}</h3>
      <p className="text-sm text-th-muted max-w-sm mb-6">{description}</p>
      {action && <Button className="btn-primary" onPress={action.onClick}>{action.label}</Button>}
    </div>
  );
}
