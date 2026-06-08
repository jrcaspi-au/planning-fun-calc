CREATE TABLE public.shared_csv (
  key text PRIMARY KEY,
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_csv TO anon, authenticated;
GRANT ALL ON public.shared_csv TO service_role;
ALTER TABLE public.shared_csv ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read shared csv" ON public.shared_csv FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can upsert shared csv" ON public.shared_csv FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update shared csv" ON public.shared_csv FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);