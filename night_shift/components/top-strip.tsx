"use client";

import { useEffect, useState } from "react";
import { Moon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Run } from "@/lib/types";

export function TopStrip({
  run,
  onRunNow,
  running,
}: {
  run: Run | null;
  onRunNow: () => void;
  running: boolean;
}) {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    setNow(new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }));
  }, []);

  return (
    <header className="flex h-[72px] items-center justify-between border-b border-border bg-surface px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Moon className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold text-foreground">Night Shift</span>
      </div>
      <div className="flex items-center gap-6">
        <span className="text-sm text-secondary">{run ? new Date(run.startedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : now}</span>
        {run && (
          <span className="text-xs text-muted">
            Finished {new Date(run.finishedAt || run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(0)}s` : "—"}
          </span>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={onRunNow}
          disabled={running}
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${running && "animate-spin"}`} />
          Run now
        </Button>
        <div className="rounded-full bg-blue-950/30 px-2.5 py-1 text-xs font-medium text-blue-400">
          Test workspace
        </div>
      </div>
    </header>
  );
}
