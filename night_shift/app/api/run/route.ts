import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { executeRun, getIsRunning } from "@/lib/job";
import { latestRun, listRuns } from "@/lib/store";

export async function POST() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (getIsRunning()) {
    return NextResponse.json({ error: "A run is already in progress" }, { status: 409 });
  }

  try {
    const run = await executeRun(true);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Run failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await listRuns();
  return NextResponse.json(runs);
}
