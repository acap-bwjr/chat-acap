# ACAP Atendimento — site + API num serviço só.
# nginx (porta 80) serve o SPA e faz proxy de /api e /socket.io pro backend (127.0.0.1:4000) no mesmo container.

# ---- Frontend (build estático) ----
FROM node:22-alpine AS front
WORKDIR /front
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
COPY chatcalmo/calmo-atendimento-frontend/package*.json ./
RUN npm ci
COPY chatcalmo/calmo-atendimento-frontend/ ./
RUN npm run build

# ---- Backend (build TypeScript) ----
FROM node:22-alpine AS back
WORKDIR /app
COPY chatcalmo/calmo-atendimento-backend/package*.json ./
RUN npm install --no-audit --no-fund
COPY chatcalmo/calmo-atendimento-backend/prisma ./prisma
RUN npx prisma generate
COPY chatcalmo/calmo-atendimento-backend/tsconfig.json ./
COPY chatcalmo/calmo-atendimento-backend/src ./src
RUN npm run build

# ---- Final ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# ffmpeg: converte áudio de voz (WebM/Opus do Chrome) para OGG/Opus aceito pela Meta
# openssl: o Prisma precisa dele no Alpine para conectar ao Postgres
RUN apk add --no-cache ffmpeg nginx openssl
COPY chatcalmo/calmo-atendimento-backend/package*.json ./
RUN npm install --no-audit --no-fund
COPY chatcalmo/calmo-atendimento-backend/prisma ./prisma
RUN npx prisma generate
COPY --from=back /app/dist ./dist
COPY --from=front /front/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/http.d/default.conf
EXPOSE 80
# IMPORTANTE: NÃO rodar "prisma db push" aqui (o CRM tem tabelas próprias no mesmo schema; ver Dockerfile do backend).
# PORT fixo em 4000: a 80 é do nginx (o Easypanel pode injetar PORT=80).
CMD ["sh", "-c", "mkdir -p /run/nginx && nginx && PORT=4000 exec node dist/index.js"]
