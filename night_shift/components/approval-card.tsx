"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";

export function ApprovalCard({
  runId,
  channel,
  onApprove,
  onSkip,
}: {
  runId: string;
  channel: string;
  onApprove: () => Promise<void>;
  onSkip: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"approved" | "skipped" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      await onApprove();
      setDone("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    setLoading(true);
    setError(null);
    try {
      await onSkip(skipReason || "Skipped by user");
      setDone("skipped");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        className="h-11 w-full text-base"
        onClick={() => setOpen(true)}
        disabled={!!done}
      >
        {done === "approved" && "Posted ✓"}
        {done === "skipped" && "Skipped"}
        {!done && `Post this digest to ${channel}`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post to {channel}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <p className="font-medium text-foreground">Channel</p>
              <p className="mt-1 flex items-center gap-2 text-secondary">
                <MessageSquare className="h-4 w-4" />
                {channel}
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-400">{error}</div>
            )}

            {!done && (
              <div className="flex gap-3">
                <Button
                  className="h-11 flex-1 bg-accent text-background hover:bg-accent-hover"
                  onClick={handleApprove}
                  disabled={loading}
                >
                  {loading ? "Posting…" : "Approve & post"}
                </Button>
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={handleSkip}
                  disabled={loading}
                >
                  Skip
                </Button>
              </div>
            )}

            {done === "approved" && (
              <div className="text-sm text-status-posted">Digest posted to Slack.</div>
            )}
            {done === "skipped" && (
              <div className="text-sm text-muted">Digest skipped. It will not be posted.</div>
            )}

            {/* Skip reason textarea */}
            {!done && (
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-border bg-surface p-3 text-sm text-foreground outline-none focus:border-accent"
                placeholder="Reason for skipping (optional)"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
