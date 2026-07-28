import { createClient } from "@supabase/supabase-js";

// Prospecção (CRM) — Supabase dedicado do Calmo.
// A anon key é pública por design (uso no browser); RLS controla o acesso.
const supabaseUrl = "https://nezovzvzoqehwttnfjej.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lem92enZ6b3FlaHd0dG5mamVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MDQyNjksImV4cCI6MjEwMDE4MDI2OX0.KMeVQwp6p8ggM4zrzj8v3KYqPQIlEkL7Y0EGate3Bkg";

export const isSupabaseConfigured = true;
export const supabase = createClient(supabaseUrl, supabaseKey);
