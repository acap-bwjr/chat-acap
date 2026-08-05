// Simula uma mensagem recebida do WhatsApp (dev). Uso:
//   tsx dev/sim-inbound.ts "5511999998888" "Olá, gostaria de ver anéis"
import { prisma } from '../src/lib/prisma.js';

const phone = process.argv[2] ?? '5511999998888';
const text = process.argv[3] ?? 'Olá, tudo bem? Gostaria de saber sobre um pedido.';
const name = process.argv[4] ?? 'Cliente Teste';

const inbox = await prisma.inbox.findFirst();
if (!inbox) {
  console.error('Nenhuma inbox encontrada — rode o seed antes.');
  process.exit(1);
}

const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: inbox.phoneNumberId ?? 'sim' },
            contacts: [{ wa_id: phone, profile: { name } }],
            messages: [
              {
                id: `wamid.sim-${Date.now()}`,
                from: phone,
                type: 'text',
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
};

const res = await fetch(`http://localhost:4000/api/webhooks/whatsapp/${inbox.id}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
console.log(`Enviado (${res.status}). Mensagem de "${name}" (${phone}): "${text}"`);
await prisma.$disconnect();
