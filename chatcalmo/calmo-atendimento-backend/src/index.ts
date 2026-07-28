import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { initRealtime } from './realtime/io.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhook.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { metaRoutes } from './routes/meta.js';
import { contactRoutes } from './routes/contacts.js';
import { templateRoutes } from './routes/templates.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { inboxRoutes } from './routes/inbox.js';
import { recuperacaoRoutes, recuperacaoOAuthRoutes } from './routes/recuperacao.js';
import { saleRoutes } from './routes/sales.js';

const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });

await app.register(cors, { origin: config.frontendOrigin, credentials: true });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

app.get('/health', async () => ({ ok: true, service: 'provai-chat', ts: Date.now() }));

await app.register(authRoutes);
await app.register(webhookRoutes);
await app.register(conversationRoutes);
await app.register(messageRoutes);
await app.register(metaRoutes);
await app.register(contactRoutes);
await app.register(templateRoutes);
await app.register(dashboardRoutes);
await app.register(inboxRoutes);
await app.register(recuperacaoOAuthRoutes);
await app.register(recuperacaoRoutes);
await app.register(saleRoutes);

const server = app.server;
initRealtime(server);

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`Provai Chat backend na porta ${config.port}`);
