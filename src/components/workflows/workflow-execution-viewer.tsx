"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Tooltip } from "@heroui/react";
import { Eye } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";

interface RefItem { id: string; name: string }

export interface StepExecution {
  id: string;
  position: number;
  stepName: string | null;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  execution: { id: string; status: string; playbook?: RefItem | null; inventory?: RefItem | null } | null;
}

export interface WorkflowExecution {
  id: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  workflow: RefItem | null;
  stepExecutions: StepExecution[];
}

interface Props {
  executionId: string | null;
  onClose: () => void;
  onUpdate?: (execution: WorkflowExecution) => void;
}

export function WorkflowExecutionViewer({ executionId, onClose, onUpdate }: Props) {
  const [exec, setExec] = useState<WorkflowExecution | null>(null);

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/workflow-executions/${id}`);
    if (!res.ok) return;
    const data: WorkflowExecution = await res.json();
    setExec(data);
    onUpdate?.(data);
    if (data.status === "running" || data.status === "pending") {
      setTimeout(() => poll(id), 1500);
    }
  }, [onUpdate]);

  useEffect(() => {
    if (executionId) {
      setExec(null);
      poll(executionId);
    }
  }, [executionId, poll]);

  function handleClose() {
    setExec(null);
    onClose();
  }

  return (
    <Modal
      isOpen={!!executionId}
      onClose={handleClose}
      title={`Workflow Run — ${exec?.workflow?.name ?? "…"}`}
      size="xl"
      footer={<Button variant="light" onPress={handleClose}>Close</Button>}
    >
      {!exec ? (
        <p className="text-th-muted text-sm">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={exec.status as "pending" | "running" | "success" | "failed" | "cancelled"} />
            {(exec.status === "running" || exec.status === "pending") && (
              <span className="text-xs text-th-subtle animate-pulse">Running…</span>
            )}
          </div>

          <div className="space-y-2">
            {exec.stepExecutions.map((se, i) => {
              const dur = se.startedAt && se.finishedAt
                ? `${Math.round((new Date(se.finishedAt).getTime() - new Date(se.startedAt).getTime()) / 1000)}s`
                : null;
              return (
                <div key={se.id} className="flex items-center gap-3 bg-card rounded-lg px-3 py-2.5">
                  <span className="w-6 h-6 rounded-full bg-input flex items-center justify-center text-xs text-th-secondary shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-th-primary truncate">{se.stepName ?? `Step ${i + 1}`}</p>
                    <p className="text-xs text-th-subtle truncate">
                      {se.execution?.playbook?.name ?? "—"} → {se.execution?.inventory?.name ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {dur && <span className="text-xs text-th-subtle">{dur}</span>}
                    <StatusBadge status={se.status as "pending" | "running" | "success" | "failed" | "cancelled"} />
                    {se.execution?.id && (
                      <Tooltip content="View execution logs">
                        <a href="/dashboard/executions" target="_blank" rel="noreferrer">
                          <Eye className="h-3.5 w-3.5 text-th-subtle hover:text-th-primary" />
                        </a>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}
            {exec.stepExecutions.length === 0 && (
              <p className="text-th-subtle text-sm text-center py-4">No steps yet…</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
