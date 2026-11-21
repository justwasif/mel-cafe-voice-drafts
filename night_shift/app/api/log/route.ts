import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { loadApprovalLog } from "@/lib/store";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log = await loadApprovalLog();
  return NextResponse.json(log);
}
