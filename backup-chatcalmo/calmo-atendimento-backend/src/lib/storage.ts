import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Storage da mídia no Supabase Storage (mesmo projeto do banco).
// Usa a service_role key (server-side) → ignora RLS pra upload.

let client: SupabaseClient | null = null;
function supa(): SupabaseClient {
  if (!client) {
    if (!config.supabase.url || !config.supabase.serviceKey) {
      throw new Error('Supabase Storage não configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
    }
    client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}

let ensured = false;
export async function ensureBucket(): Promise<void> {
  if (ensured) return;
  const bucket = config.supabase.bucket;
  const { data } = await supa().storage.getBucket(bucket);
  if (!data) {
    await supa().storage.createBucket(bucket, { public: true });
  }
  ensured = true;
}

/** Sobe um buffer e devolve a URL pública. */
export async function putObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  await ensureBucket();
  const { error } = await supa()
    .storage.from(config.supabase.bucket)
    .upload(key, data, { contentType, upsert: true });
  if (error) throw new Error(`Supabase Storage: ${error.message}`);
  const { data: pub } = supa().storage.from(config.supabase.bucket).getPublicUrl(key);
  return pub.publicUrl;
}
