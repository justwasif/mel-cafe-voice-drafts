import { NextResponse } from 'next/server';
import { getMenu } from '@/lib/cafe';

export async function GET() {
  try {
    const menu = await getMenu();
    return NextResponse.json({ menu });
  } catch (err: any) {
    console.error('Menu error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

