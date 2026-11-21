import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { approveRun } from "@/lib/job";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const run = await approveRun(id);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 400 }
    );
  }
}
