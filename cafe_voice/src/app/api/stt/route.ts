import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio') as File;
    if (!audio) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY!;
    const elevenForm = new FormData();
    elevenForm.append('file', audio, 'audio.webm');
    elevenForm.append('model_id', 'scribe_v1');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: elevenForm,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'STT failed', details: err }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || '' });
  } catch (err: any) {
    console.error('STT error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

