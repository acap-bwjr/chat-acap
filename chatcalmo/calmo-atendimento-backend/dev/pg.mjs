// Sobe um Postgres real embutido (sem instalar nada) para desenvolvimento local.
// Mantém o processo vivo até ser encerrado (Ctrl+C).
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

const alreadyInit = existsSync(join(dataDir, 'PG_VERSION'));
if (!alreadyInit) {
  console.log('[pg] inicializando cluster…');
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('provai_chat');
  console.log('[pg] banco provai_chat criado');
} catch {
  console.log('[pg] banco provai_chat já existe');
}
console.log('[pg] PRONTO em postgresql://postgres:postgres@localhost:5433/provai_chat');

async function shutdown() {
  console.log('\n[pg] parando…');
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
