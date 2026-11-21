# Lantern & Thyme — Voice Host

A voice-powered restaurant reservation system built with Next.js, Supabase, ElevenLabs, and Google Gemini.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment variables**
   Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server only)
   - `ELEVENLABS_API_KEY` — from ElevenLabs dashboard
   - `ELEVENLABS_VOICE_ID` — voice ID for Juniper
   - `GEMINI_API_KEY` — Google AI Studio key
   - `GEMINI_MODEL` — e.g. `gemini-2.0-flash`
   - `HOST_EMAIL` / `HOST_PASSWORD` — seeded host credentials

3. **Supabase setup**
   - Create a project at https://supabase.com
   - Run the migration in `supabase/migrations/001_initial.sql` via the SQL Editor
   - Run the seed in `supabase/seed.sql`
   - Enable Realtime on the `bookings` table
   - Create a host user in Auth (email/password from env)

4. **Run locally**
   ```bash
   npm run dev
   ```

5. **Build & test**
   ```bash
   npm run build
   npx jest
   ```

## Architecture

- `/` — Guest voice page (mic orb, transcript, booking card with realtime status)
- `/host` — Host dashboard (auth, pending/approved/declined tabs, approve/decline)
- `/api/chat` — Gemini function-calling loop with Supabase tools
- `/api/stt` — ElevenLabs speech-to-text
- `/api/tts` — ElevenLabs text-to-speech

## Database

- `restaurant_info` — hours, policies, menu highlights
- `dining_tables` — 12 tables (2/4/6/8 seats)
- `bookings` — reservations with exclusion constraint for overlap protection
- RPCs: `find_open_tables`, `create_pending_booking`

## Acceptance Checklist

1. Ask "What time do you close on Saturday?" → correct answer from restaurant_info, spoken.
2. Ask "Do you have vegan options?" → answer from menu data only.
3. Book "a table for 4 this Friday at 7pm" → collects details, reads them back, saves PENDING.
4. Booking appears on /host live, without a refresh.
5. Host clicks Approve → the guest page badge flips to Approved live.
6. Try to book a full slot → Juniper offers 2 nearby times.
7. A party of 10 → politely declined. A past date → refused.
8. Two bookings racing for the last table → only one succeeds (DB constraint).
9. Anonymous Supabase client can't read bookings (RLS check).
10. `npm run build` and the tests pass.
