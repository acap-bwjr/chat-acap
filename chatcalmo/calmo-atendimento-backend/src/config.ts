import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Env obrigatória ausente: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: req('JWT_SECRET', 'dev-secret-troque-em-producao'),
  databaseUrl: req('DATABASE_URL'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? '*',
  // Sandbox: não chama o WhatsApp de verdade (só registra as saídas). Para testar local.
  sandbox: (process.env.WA_SANDBOX ?? 'false') === 'true',
  // Supabase (Storage da mídia). O banco é configurado via DATABASE_URL (Prisma).
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
    bucket: process.env.SUPABASE_BUCKET ?? 'chat-midia',
  },
  // Cecília (agente de triagem no n8n): webhook de saída + chave do bot
  cecilia: {
    botKey: process.env.CECILIA_BOT_KEY ?? '',
    webhookUrl: process.env.CECILIA_WEBHOOK_URL ?? '', // ex: http://n8n:5678/webhook/calmo-triagem
    accountId: process.env.CECILIA_ACCOUNT_ID ?? 'calmo',
  },
  // Base pública do próprio backend (para o Meta chamar o webhook)
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
};
