-- Seed data for Lantern & Thyme
-- Run after migrations. Safe to re-run (uses ON CONFLICT DO NOTHING on reference).
--
-- All booking times are built in restaurant_info.timezone and stored as
-- correct timestamptz, inside opening hours.

DO $$
DECLARE
  v_tz text;
  v_hours jsonb;
  v_dow text;
  v_day_hours jsonb;
  v_open text;
  v_close text;
  v_names text[] := ARRAY['Avery M.','Jordan K.','Taylor R.','Morgan L.','Casey B.','Riley S.','Quinn J.','Drew P.','Skyler N.','Jamie W.','Parker H.','Cameron F.','Reese D.','Sage G.','Alex T.'];
  v_phones text[] := ARRAY['(555) 111-0001','(555) 222-0002','(555) 333-0003','(555) 444-0004','(555) 555-0005','(555) 666-0006','(555) 777-0007','(555) 888-0008','(555) 999-0009','(555) 000-0010','(555) 111-0020','(555) 222-0030','(555) 333-0040','(555) 444-0050','(555) 555-0060'];
  i int;
  v_day_offset int;
  v_local_date date;
  v_hour int;
  v_minute int;
  v_local_ts timestamp;          -- wall-clock time in restaurant tz
  v_start timestamptz;           -- correct timestamptz (converted from local)
  v_table_id uuid;
  v_status text;
  v_party int;
  v_ref text;
  v_made int := 0;
BEGIN
  -- Get timezone and hours as scalars (avoids %ROWTYPE column-order issues)
  SELECT timezone, hours INTO v_tz, v_hours FROM restaurant_info LIMIT 1;

  <<seed_loop>>
  FOR i IN 1..40 LOOP  -- try up to 40 times to get 20 valid bookings
    EXIT WHEN v_made >= 20;

    -- Pick a random day 0-6 days ahead, in the restaurant's timezone
    v_day_offset := floor(random()*7)::int;
    v_local_date := (now() AT TIME ZONE v_tz)::date + v_day_offset;

    -- Day of week for this local date
    v_dow := lower(to_char(v_local_date, 'day'));
    v_dow := btrim(v_dow);

    v_day_hours := v_hours -> v_dow;
    CONTINUE seed_loop WHEN v_day_hours IS NULL OR v_day_hours->>'open' IS NULL;

    v_open  := v_day_hours->>'open';
    v_close := v_day_hours->>'close';

    -- Pick a random hour between open and close-2 (so 90-min slot fits)
    v_hour := (split_part(v_open, ':', 1))::int + floor(random() * ((split_part(v_close, ':', 1))::int - (split_part(v_open, ':', 1))::int - 1))::int;
    v_minute := (floor(random()*4)::int * 15)::int;

    -- Build a local (timezone-naive) timestamp, then convert to timestamptz
    -- by telling Postgres it's in the restaurant timezone.
    v_local_ts := v_local_date + make_interval(hours => v_hour, mins => v_minute);
    v_start := v_local_ts AT TIME ZONE v_tz;

    v_party := (ARRAY[2,2,4,4,4,4,6,6,6,8])[floor(random()*10)+1];

    -- Pick a table that fits and isn't already taken
    SELECT t.id INTO v_table_id
    FROM dining_tables t
    WHERE t.seats >= v_party
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.table_id = t.id
          AND b.status IN ('pending','approved')
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_start + interval '90 minutes')
      )
    ORDER BY random()
    LIMIT 1;

    CONTINUE seed_loop WHEN v_table_id IS NULL;

    v_status := (ARRAY['pending','pending','approved','approved','declined'])[floor(random()*5)+1];
    v_ref := 'LT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    INSERT INTO bookings (
      guest_name, guest_phone, party_size, starts_at, ends_at,
      table_id, status, notes, source, reference, created_at, decided_at, decision_note
    ) VALUES (
      v_names[floor(random()*array_length(v_names,1))+1],
      v_phones[floor(random()*array_length(v_phones,1))+1],
      v_party,
      v_start,
      v_start + interval '90 minutes',
      v_table_id,
      v_status,
      CASE WHEN random() > 0.7 THEN 'Anniversary dinner' WHEN random() > 0.5 THEN 'Nut allergy' ELSE NULL END,
      'voice',
      v_ref,
      v_start - interval '1 day',
      CASE WHEN v_status != 'pending' THEN v_start - interval '12 hours' ELSE NULL END,
      CASE WHEN v_status = 'declined' THEN 'Requested patio, fully booked' ELSE NULL END
    )
    ON CONFLICT (reference) DO NOTHING;

    v_made := v_made + 1;
  END LOOP;

  RAISE NOTICE 'Seeded % bookings', v_made;
END $$;
