# Provai Chat — backend
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg: converte áudio de voz (WebM/Opus do Chrome) para OGG/Opus aceito pela Meta
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# IMPORTANTE: NÃO rodar "prisma db push" aqui.
# O CRM (Prospecção) tem tabelas próprias (leads, capturas_jobs, leads_google_maps,
# leads_instagram, interacoes, cookies) no MESMO banco/schema public. Como elas não
# estão no schema.prisma, "db push --accept-data-loss" as DROPA a cada deploy.
# O schema do chat já está aplicado; mudanças futuras no schema do chat devem ser
# aplicadas manualmente (npx prisma db push) fora do start do container.
CMD ["node", "dist/index.js"]
