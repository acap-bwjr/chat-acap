import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/auth.js';

const users = [
  { name: 'Bruno',   email: 'calmostore1@gmail.com',        role: 'admin' as const, pass: 'calmoloja5' },
  { name: 'Caio',    email: 'caioayache@gmail.com',         role: 'admin' as const, pass: 'Trocar123' },
  { name: 'Victor',  email: 'viictor.1477@gmail.com',       role: 'agent' as const, pass: '@Tricolor1930' },
  { name: 'Soares',  email: 'soaresmatheus97@outlook.com',  role: 'agent' as const, pass: 'soSo*24-01@' },
  { name: 'Gabriel', email: 'g_reeeis@outlook.com',         role: 'agent' as const, pass: 'Calmo101262' },
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where: { accountId_email: { accountId: 'calmo', email: u.email } },
      update: { name: u.name, role: u.role, passwordHash: await hashPassword(u.pass) },
      create: { accountId: 'calmo', name: u.name, email: u.email, role: u.role, passwordHash: await hashPassword(u.pass) },
    });
    console.log('ok:', u.name, u.email, u.role);
  }
  await prisma.$disconnect();
}
main();
