import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Prospecção (CRM) — Supabase do Calmô.
// As credenciais NÃO ficam mais fixas no código: isso fazia esta cópia local
// escrever direto no banco de produção (o app principal). Configure
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env deste app (com um projeto
// Supabase separado para dev) se quiser reconectar o módulo de Prospecção.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Sem env configurada: builder no-op que nunca sai da máquina local, para não
// derrubar as telas que chamam supabase.from(...) sem checar isSupabaseConfigured.
function disconnectedClient(): SupabaseClient {
  const error = {
    message: "Supabase desconectado neste ambiente local (defina VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para religar).",
  };
  const result = Promise.resolve({ data: null, error });
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return result.then.bind(result);
        if (prop === "catch") return result.catch.bind(result);
        if (prop === "finally") return result.finally.bind(result);
        return () => builder;
      },
    }
  );
  return { from: () => builder } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseKey as string)
  : disconnectedClient();
