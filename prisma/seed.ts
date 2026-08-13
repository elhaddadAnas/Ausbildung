import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || adminPassword.length < 12) {
    throw new Error('ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required.');
  }
  console.log('Seeding configured admin account...');

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const adminUser = await db.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
    },
    create: {
      email: adminEmail,
      name: 'System Administrator',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      profile: {
        create: {
          bio: 'Administrateur système.',
        },
      },
      notificationConfig: { create: {} },
    },
  });

  // Ensure default candidate account demo@ausbildung-finder.de exists as USER
  const demoPassword = process.env.DEMO_PASSWORD || '';
  if (demoPassword.length >= 12) {
    const userPasswordHash = await bcrypt.hash(demoPassword, 12);
    await db.user.upsert({
      where: { email: 'demo@ausbildung-finder.de' },
      update: { role: 'USER', passwordHash: userPasswordHash },
      create: {
        email: 'demo@ausbildung-finder.de',
        name: 'Demo User',
        passwordHash: userPasswordHash,
        role: 'USER',
        profile: { create: { bio: 'Compte de démonstration.' } },
        notificationConfig: { create: {} },
      },
    });
  }

  console.log('Database seeded successfully!');
  console.log('Sole Admin Account:', adminUser.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
