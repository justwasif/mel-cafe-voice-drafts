"use client";

import type { RunStep } from "@/lib/types";

export function Timeline({ steps }: { steps: RunStep[] }) {
  if (!steps.length) return null;

  // Calculate total duration for positioning
  const startedAt = steps[0]?.startedAt;
  const finishedAt = steps.find((s) => s.status === "done")?.finishedAt || new Date().toISOString();

  const totalMs = new Date(finishedAt).getTime() - new Date(startedAt || finishedAt).getTime();
  const totalDuration = totalMs > 0 ? totalMs : 120000; // fallback 2 min

  return (
    <div className="relative flex items-start gap-4 py-4">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

      {steps.map((step, i) => {
        const isDone = step.status === "done";
        const isRunning = step.status === "running";
        const isError = step.status === "error";

        let offsetPct = 0;
        if (step.startedAt) {
          offsetPct = ((new Date(step.startedAt).getTime() - new Date(startedAt!).getTime()) / totalDuration) * 100;
        }

        return (
          <div key={step.key} className="relative flex items-center gap-3 pl-0">
            {/* Node */}
            <div
              className={cn(
                "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isDone && "border-status-posted bg-emerald-950/30 text-status-posted",
                isRunning && "border-accent bg-accent-soft text-accent animate-pulse",
                isError && "border-red-400 bg-red-950/30 text-red-400",
                !isDone && !isRunning && !isError && "border-muted bg-surface text-muted"
              )}
            >
              {isDone ? "✓" : isError ? "✗" : i + 1}
            </div>

            {/* Label */}
            <div className="min-w-[100px] pt-0.5">
              <p className={`text-xs font-medium ${
                isDone ? "text-foreground" : isRunning ? "text-accent" : isError ? "text-red-400" : "text-muted"
              }`}>
                {step.label}
              </p>
              {step.error && <p className="mt-0.5 text-[10px] text-red-400">{step.error}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
