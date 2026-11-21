import { NextRequest, NextResponse } from "next/server";
import { signIn, signOut } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { password } = (await request.json()) as { password?: string };
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }
  const ok = await signIn(password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await signOut();
  return NextResponse.json({ ok: true });
}
