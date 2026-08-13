import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

function required(name, minimum = 1) {
  const value = process.env[name]?.trim() || '';
  if (value.length < minimum) {
    throw new Error(`${name} must contain at least ${minimum} characters.`);
  }
  return value;
}

async function main() {
  const adminEmail = required('ADMIN_EMAIL').toLowerCase();
  const adminPassword = required('ADMIN_PASSWORD', 12);
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', passwordHash },
    create: {
      email: adminEmail,
      name: 'Global Job Finder Admin',
      role: 'ADMIN',
      passwordHash,
      profile: { create: { autoSearchEnabled: true, autoSearchIntervalMins: 30 } },
      notificationConfig: { create: { emailEnabled: true, alertOnNewMatch: true } },
    },
  });

  const sampleJobs = [
    {
      externalId: 'SAMPLE-GLOBAL-001',
      title: 'Software Engineer',
      company: 'Northstar Labs',
      location: 'Toronto, Canada',
      country: 'Canada',
      category: 'Technology',
      remote: true,
      description: 'Build and maintain web products for an international customer base.',
      requirements: 'JavaScript, TypeScript, communication and teamwork.',
      url: 'https://example.com/jobs/software-engineer',
    },
    {
      externalId: 'SAMPLE-GLOBAL-002',
      title: 'Product Designer',
      company: 'Atlas Studio',
      location: 'Paris, France',
      country: 'France',
      category: 'Design',
      remote: false,
      description: 'Design accessible product experiences for web and mobile users.',
      requirements: 'Product design, prototyping, research and collaboration.',
      url: 'https://example.com/jobs/product-designer',
    },
    {
      externalId: 'SAMPLE-GLOBAL-003',
      title: 'Customer Success Manager',
      company: 'Horizon Group',
      location: 'Worldwide',
      country: 'Worldwide',
      category: 'Sales',
      remote: true,
      description: 'Support international customers and improve product adoption.',
      requirements: 'Customer service, communication and account management.',
      url: 'https://example.com/jobs/customer-success',
    },
  ];

  for (const job of sampleJobs) {
    await db.jobOffer.upsert({
      where: { externalId: job.externalId },
      update: job,
      create: {
        ...job,
        contractType: 'Employment',
        workTime: 'Full-time',
        salary: 'Not specified',
        postalCode: '',
        contactEmail: null,
      },
    });
  }

  console.log('Global Job Finder AI database seeded successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
