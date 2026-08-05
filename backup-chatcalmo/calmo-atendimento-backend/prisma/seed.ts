import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/auth.js';

/**
 * Popula a conta da Calmô: times (SAC/Vendas/Personalizados), atendentes
 * e a inbox do WhatsApp. As credenciais do WhatsApp podem ficar em branco
 * agora e ser preenchidas no cutover (ou via env).
 */
async function main() {
  const account = await prisma.account.upsert({
    where: { id: 'calmo' },
    update: { name: 'Calmô' },
    create: { id: 'calmo', name: 'Calmô' },
  });

  // Times
  const teamNames = ['SAC', 'Vendas', 'Personalizados'];
  for (const name of teamNames) {
    await prisma.team.upsert({
      where: { accountId_name: { accountId: account.id, name } },
      update: {},
      create: { accountId: account.id, name },
    });
  }

  // Apenas a conta de login/gestão (auto-login do módulo). Sem atendentes por
  // enquanto — a Calmô cadastra os próprios quando quiser.
  const users = [
    { name: 'Administrador', email: 'admin@calmo.com.br', role: 'admin' as const, pass: 'calmo-interno-2026' },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { accountId_email: { accountId: account.id, email: u.email } },
      update: { name: u.name, role: u.role },
      create: {
        accountId: account.id,
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: await hashPassword(u.pass),
      },
    });
  }

  // Inbox WhatsApp (credenciais preenchidas no cutover)
  const existing = await prisma.inbox.findFirst({ where: { accountId: account.id } });
  if (!existing) {
    await prisma.inbox.create({
      data: {
        accountId: account.id,
        name: 'WhatsApp Calmô',
        channelType: 'whatsapp_cloud',
        phoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? null,
        wabaId: process.env.WA_WABA_ID ?? null,
        accessToken: process.env.WA_ACCESS_TOKEN ?? null,
        verifyToken: process.env.WA_VERIFY_TOKEN ?? 'calmo-chat-verify',
      },
    });
  }

  console.log('Seed concluído. Login admin: admin@calmo.com.br / calmo-interno-2026');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
