"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Chip } from "@heroui/react";
import { cn } from "@/lib/utils";

interface LogLine {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  host?: string | null;
  task?: string | null;
}

interface Props {
  executionId: string;
  onStatusChange?: (status: string) => void;
}

const MAX_LOGS = 2000;

const levelColors: Record<string, string> = {
  info: "text-th-secondary",
  debug: "text-th-subtle",
  warning: "text-yellow-400",
  error: "text-red-400",
};

export function LogViewer({ executionId, onStatusChange }: Props) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);

  useEffect(() => {
    let done = false;
    let retries = 0;
    let es: EventSource | null = null;

    function connect() {
      if (done) return;
      es = new EventSource(`/api/executions/${executionId}/logs`);
      setConnected(true);

      es.onmessage = (event) => {
        retries = 0;
        const data = JSON.parse(event.data);
        if (data.type === "log") {
          setLogs((prev) => {
            if (prev.some(l => l.id === data.data.id)) return prev;
            const next = [...prev, data.data];
            // Keep only the last MAX_LOGS lines to avoid browser slowdown on long runs
            return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
          });
          if (autoScrollRef.current) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
          }
        } else if (data.type === "done") {
          done = true;
          setStatus(data.status);
          onStatusChangeRef.current?.(data.status);
          es!.close();
          setConnected(false);
        }
      };

      es.onerror = () => {
        es!.close();
        setConnected(false);
        if (!done && retries < 3) {
          retries++;
          setTimeout(connect, 2000 * retries); // backoff: 2s, 4s, 6s
        }
      };
    }

    connect();
    return () => {
      done = true;
      es?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    autoScrollRef.current = isNearBottom;
  }

  return (
    <div className="flex flex-col h-[60vh]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-input border-b border-border-base">
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-th-subtle inline-block"></span>
          )}
          <span className="text-xs text-th-muted">
            {connected ? "Live" : "Completed"}
          </span>
        </div>
        <Chip
          size="sm"
          color={
            status === "success"
              ? "success"
              : status === "failed"
              ? "danger"
              : status === "running"
              ? "primary"
              : "default"
          }
          variant="flat"
          className="capitalize"
        >
          {status}
        </Chip>
        <span className="text-xs text-th-subtle ml-auto">
          {logs.length >= MAX_LOGS ? `last ${MAX_LOGS} lines` : `${logs.length} lines`}
        </span>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-page p-4 font-mono text-sm log-output"
      >
        {logs.length === 0 ? (
          <p className="text-th-subtle text-xs">Waiting for output…</p>
        ) : logs.length >= MAX_LOGS ? (
          <p className="text-yellow-600/70 text-xs mb-2">
            Output truncated — showing last {MAX_LOGS} lines only.
          </p>
        ) : null}
        {logs.length > 0 && (
          logs.map((log) => (
            <div key={log.id} className={cn("flex gap-2 leading-5", levelColors[log.level])}>
              <span className="text-th-subtle shrink-0 text-xs pt-0.5">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="break-all whitespace-pre-wrap">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
