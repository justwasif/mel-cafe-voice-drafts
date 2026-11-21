import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { skipRun } from "@/lib/job";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  try {
    const run = await skipRun(id, body.reason);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Skip failed" },
      { status: 400 }
    );
  }
}
