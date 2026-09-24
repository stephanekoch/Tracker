-- Run once in Supabase (safe to re-run).
-- manual_fields: which auto fields you overrode for that day (never overwritten by a sync)
-- auto_values:   what each provider last reported, shown next to an override
ALTER TABLE tracker_entries ADD COLUMN IF NOT EXISTS manual_fields text[] DEFAULT '{}';
ALTER TABLE tracker_entries ADD COLUMN IF NOT EXISTS auto_values jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS tracker_settings (key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now());
ALTER TABLE tracker_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tracker_settings' AND policyname='allow_all_settings') THEN
    CREATE POLICY "allow_all_settings" ON tracker_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
