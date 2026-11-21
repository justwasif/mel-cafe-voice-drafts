import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { loadSettings, saveSettings } from "@/lib/store";
import type { WatchlistEntry } from "@/lib/types";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await loadSettings();
  return NextResponse.json(settings.watchlist);
}

export async function POST(request: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { watchlist?: WatchlistEntry[] };
  if (!Array.isArray(body.watchlist) || body.watchlist.length > 5) {
    return NextResponse.json({ error: "Invalid watchlist (max 5)" }, { status: 400 });
  }

  const settings = await loadSettings();
  settings.watchlist = body.watchlist;
  await saveSettings(settings);
  return NextResponse.json(settings.watchlist);
}
