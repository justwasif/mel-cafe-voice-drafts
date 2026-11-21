"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Moon, Globe, Bug, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

const steps: Array<{ key: string; label: string; icon: typeof Globe }> = [
  { key: "fetch", label: "Fetch pages", icon: Globe },
  { key: "extract", label: "Extract plans & prices", icon: PenLine },
  { key: "compare", label: "Compare with last snapshot", icon: Globe },
  { key: "sentry", label: "Read Sentry", icon: Bug },
  { key: "digest", label: "Write digest", icon: PenLine },
];

export function BuildingState() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    steps.forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          setStep((s) => Math.max(s, index + 1));
        }, index * 500)
      );
    });

    timers.push(
      setTimeout(() => setStep(5), steps.length * 500 + 400)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-16">
      <div className="w-full rounded-[14px] border border-border bg-surface p-6 shadow">
        <div className="mb-5 flex items-center gap-2 text-sm font-medium text-secondary">
          <Moon className="h-4 w-4 text-accent" />
          Night shift in progress
        </div>
        <div className="space-y-3">
          {steps.map((stepItem, index) => {
            const { label, icon: Icon } = stepItem;
            const status = step > index + 1 ? "done" : step === index + 1 ? "running" : "waiting";
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center justify-between rounded-xl border border-border px-4 py-3 transition-all",
                  status === "running" && "bg-accent-soft/40 border-accent/20",
                  status === "done" && "bg-emerald-950/10"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    status === "done" ? "bg-emerald-950/20 text-status-posted" :
                    status === "running" ? "bg-accent-soft text-accent" :
                    "bg-surface text-muted"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-secondary">
                  {status === "waiting" && <span className="text-muted">Waiting</span>}
                  {status === "running" && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                      <span>Running…</span>
                    </>
                  )}
                  {status === "done" && (
                    <>
                      <Check className="h-3.5 w-3.5 text-status-posted" />
                      <span>Done</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
