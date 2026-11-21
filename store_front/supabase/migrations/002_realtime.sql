-- Add approval_requests to realtime publication
BEGIN;
  -- Create publication if it doesn't exist
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END
  $$;

  -- Add approval_requests table to the publication if not already added
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'approval_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE approval_requests;
    END IF;
  END
  $$;
COMMIT;
