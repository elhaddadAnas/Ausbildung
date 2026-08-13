import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const demoPassword = process.env.DEMO_PASSWORD || '';
  if (!adminEmail || adminPassword.length < 12 || demoPassword.length < 12) {
    throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD and DEMO_PASSWORD (12+ characters) are required for seeding.');
  }
  console.log('🌱 Seeding Ausbildung Finder AI Database...');

  // 1. Create Admin User
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'System Admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
  });

  // 2. Create Regular Demo User
  const userPasswordHash = await bcrypt.hash(demoPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@ausbildung-finder.de' },
    update: {},
    create: {
      email: 'demo@ausbildung-finder.de',
      name: 'Lukas Weber',
      passwordHash: userPasswordHash,
      role: 'USER',
      avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    },
  });

  // 3. User Profile
  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      phone: '+49 176 12345678',
      address: 'Friedrichstraße 42',
      city: 'Berlin',
      postalCode: '10117',
      federalState: 'Berlin',
      bio: 'Motivierter Fachinformatiker-Anwärter mit Leidenschaft für moderne Webtechnologien und Software-Architektur.',
      drivingLicense: 'Klasse B (PKW)',
      languages: JSON.stringify(['Deutsch (Muttersprache)', 'Englisch (C1 - Verhandlungssicher)']),
      salaryExpectation: '1.200 € / Monat',
      contractTypePreference: 'Vollzeit',
      remotePreference: true,
      autoSearchEnabled: true,
      autoSearchIntervalMins: 30,
      cvFileName: 'Lukas_Weber_Lebenslauf_2026.pdf',
      cvParsedText: 'Lukas Weber. Abitur 2025. Erfahrung mit HTML, CSS, JavaScript, React, Python, Git. Praktikum in IT-Abteilung.',
    },
  });

  // Educations
  if (await prisma.education.count({ where: { profileId: profile.id } }) === 0) {
    await prisma.education.createMany({
      data: [
      {
        profileId: profile.id,
        degree: 'Abitur (Allgemeine Hochschulreife)',
        fieldOfStudy: 'Schwerpunkt Mathematik & Informatik',
        institution: 'Heinrich-Hertz-Gymnasium Berlin',
        location: 'Berlin',
        startDate: '2017-09',
        endDate: '2025-06',
        current: false,
        description: 'Abschlussnote: 1,8. Leistungskurse Mathematik und Englisch.',
      },
      ],
    });
  }

  // Skills
  if (await prisma.skill.count({ where: { profileId: profile.id } }) === 0) {
    await prisma.skill.createMany({
      data: [
      { profileId: profile.id, name: 'JavaScript / TypeScript', category: 'IT', level: 'Advanced' },
      { profileId: profile.id, name: 'React & Next.js', category: 'IT', level: 'Intermediate' },
      { profileId: profile.id, name: 'Python', category: 'IT', level: 'Intermediate' },
      { profileId: profile.id, name: 'Git & GitHub', category: 'IT', level: 'Advanced' },
      { profileId: profile.id, name: 'MS Office & Excel', category: 'Kaufmännisch', level: 'Expert' },
      { profileId: profile.id, name: 'Englisch C1', category: 'Sprachen', level: 'Advanced' },
      ],
    });
  }

  // Sample Job Offers from Arbeitsagentur
  const jobsData = [
    {
      externalId: 'BA-10000-11892341',
      title: 'Ausbildung 2026: Fachinformatiker (m/w/d) Anwendungsentwicklung',
      company: 'SAP SE',
      location: 'Berlin',
      postalCode: '10117',
      federalState: 'Berlin',
      category: 'IT & Software',
      contractType: 'Berufsausbildung',
      workTime: 'Vollzeit',
      remote: true,
      salary: '1.250 € / Monat',
      description: 'Entwicklung moderner Cloud-Softwarelösungen mit JavaScript, TypeScript, Python und Java. Arbeiten in agilen SCRUM Teams.',
      requirements: 'Abitur oder sehr guter Realschulabschluss, gute Mathe- und Englischkenntnisse, erste Programmiererfahrung.',
      url: 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche?id=BA-10000-11892341',
      searchKeyword: 'Fachinformatiker',
    },
    {
      externalId: 'BA-10000-11892342',
      title: 'Ausbildung zum Kaufmann für Büromanagement (m/w/d)',
      company: 'Siemens AG',
      location: 'München',
      postalCode: '80333',
      federalState: 'Bayern',
      category: 'Kaufmännisch',
      contractType: 'Berufsausbildung',
      workTime: 'Vollzeit',
      remote: false,
      salary: '1.180 € / Monat',
      description: 'Erlernen organisatorischer und kaufmännischer Aufgaben in Kundenkommunikation, Rechnungswesen und Projektmanagement.',
      requirements: 'Mittlere Reife, MS-Office Kenntnisse, Kommunikationsstärke.',
      url: 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche?id=BA-10000-11892342',
      searchKeyword: 'Kaufmann',
    },
    {
      externalId: 'BA-10000-11892343',
      title: 'Ausbildung Mechatroniker (m/w/d) 2026',
      company: 'BMW Group',
      location: 'München',
      postalCode: '80809',
      federalState: 'Bayern',
      category: 'Handwerk & Industrie',
      contractType: 'Berufsausbildung',
      workTime: 'Vollzeit',
      remote: false,
      salary: '1.220 € / Monat',
      description: 'Kombination aus Mechanik, Elektronik und Informatik. Montage und Instandhaltung automatisierter Roboteranlagen.',
      requirements: 'Realschulabschluss mit Physik & Mathe, technisches Verständnis.',
      url: 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche?id=BA-10000-11892343',
      searchKeyword: 'Mechatroniker',
    },
    {
      externalId: 'BA-10000-11892344',
      title: 'Ausbildung Pflegefachfrau / Pflegefachmann (m/w/d)',
      company: 'Charité Universitätsmedizin Berlin',
      location: 'Berlin',
      postalCode: '10117',
      federalState: 'Berlin',
      category: 'Gesundheit & Pflege',
      contractType: 'Berufsausbildung',
      workTime: 'Vollzeit',
      remote: false,
      salary: '1.340 € / Monat',
      description: 'Generalistische Pflegeausbildung mit Praxiseinsätzen in Chirurgie, Pädiatrie und Intensivpflege.',
      requirements: 'Mittlerer Schulabschluss, B2 Deutschkenntnisse, Einfühlungsvermögen.',
      url: 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche?id=BA-10000-11892344',
      searchKeyword: 'Pflege',
    },
    {
      externalId: 'BA-10000-11892345',
      title: 'Ausbildung Fachinformatiker Systemintegration (m/w/d)',
      company: 'Deutsche Telekom AG',
      location: 'Köln',
      postalCode: '50667',
      federalState: 'Nordrhein-Westfalen',
      category: 'IT & Software',
      contractType: 'Berufsausbildung',
      workTime: 'Vollzeit',
      remote: true,
      salary: '1.190 € / Monat',
      description: 'Planung, Konfiguration und Betreuung von IT-Netzwerken, Servern und Cyber-Security Systemen.',
      requirements: 'Realschulabschluss oder Abitur, IT-Interesse.',
      url: 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche?id=BA-10000-11892345',
      searchKeyword: 'Systemintegration',
    },
  ];

  for (const item of jobsData) {
    await prisma.jobOffer.upsert({
      where: { externalId: item.externalId },
      update: {},
      create: item,
    });
  }

  // Create Applications for Lukas Weber
  const sapJob = await prisma.jobOffer.findUnique({ where: { externalId: 'BA-10000-11892341' } });
  const telekomJob = await prisma.jobOffer.findUnique({ where: { externalId: 'BA-10000-11892345' } });
  const bmwJob = await prisma.jobOffer.findUnique({ where: { externalId: 'BA-10000-11892343' } });

  if (sapJob) {
    await prisma.jobApplication.upsert({
      where: { userId_jobOfferId: { userId: user.id, jobOfferId: sapJob.id } },
      update: {},
      create: {
        userId: user.id,
        jobOfferId: sapJob.id,
        status: 'INTERVIEW',
        matchScore: 92,
        missingSkills: JSON.stringify(['Docker', 'REST-APIs']),
        cvTips: JSON.stringify(['Heben Sie Ihr Schulprojekt in React im Anschreiben hervor.']),
        notesText: 'Vorstellungsgespräch am 15. August um 10:00 Uhr via Microsoft Teams.',
        interviewDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        appliedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      },
    });
  }

  if (telekomJob) {
    await prisma.jobApplication.upsert({
      where: { userId_jobOfferId: { userId: user.id, jobOfferId: telekomJob.id } },
      update: {},
      create: {
        userId: user.id,
        jobOfferId: telekomJob.id,
        status: 'APPLIED',
        matchScore: 85,
        missingSkills: JSON.stringify(['Cisco Networking']),
        cvTips: JSON.stringify(['Zertifikate hinzufügen']),
        notesText: 'Bewerbung per E-Mail gesendet.',
        appliedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      },
    });
  }

  if (bmwJob) {
    await prisma.jobApplication.upsert({
      where: { userId_jobOfferId: { userId: user.id, jobOfferId: bmwJob.id } },
      update: {},
      create: {
        userId: user.id,
        jobOfferId: bmwJob.id,
        status: 'SAVED',
        matchScore: 78,
        missingSkills: JSON.stringify(['CAD Grundlagen']),
        notesText: 'Interessantes Angebot für August.',
      },
    });
  }

  // Notification Config
  await prisma.notificationConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      emailEnabled: true,
      telegramEnabled: false,
      discordEnabled: false,
      alertOnNewMatch: true,
      alertOnStatusChange: true,
    },
  });

  // System Logs
  if (await prisma.systemLog.count() === 0) {
    await prisma.systemLog.create({
      data: {
        source: 'SEED',
        level: 'INFO',
        message: 'Données de démonstration initialisées.',
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
