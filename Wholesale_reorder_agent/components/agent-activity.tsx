'use client';

interface Run {
  id: string;
  status: 'running' | 'completed' | 'failed';
  summary: string | null;
  variants_checked: number | null;
  order_now_count: number | null;
  draft_pos_created: number | null;
  started_at: string;
  finished_at: string | null;
}

export function AgentActivity({ runs }: { runs: Run[] }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.08)]">
      <h3 className="mb-4 text-sm font-semibold text-[#111827]">Agent activity</h3>
      <div className="space-y-3">
        {runs.length === 0 ? (
          <p className="text-sm text-[#9CA3AF]">No runs yet. Click <span className="font-medium text-[#4B5563]">Check stock</span> to start.</p>
        ) : (
          runs.map(run => (
            <div key={run.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    run.status === 'completed'
                      ? 'bg-[#15803D]'
                      : run.status === 'failed'
                      ? 'bg-[#B91C1C]'
                      : 'bg-[#B45309]'
                  }`}
                />
                <div className="w-px flex-1 bg-[#E5E7EB]" />
              </div>
              <div className="flex-1 pb-3">
                <div className="text-xs text-[#9CA3AF]">
                  {new Date(run.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="mt-0.5 text-sm text-[#111827]">
                  {run.summary ?? (run.status === 'running' ? 'Checking stock…' : 'Run completed')}
                </div>
                {run.status === 'failed' && (
                  <div className="mt-1 text-xs text-[#B91C1C]">Failed</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
