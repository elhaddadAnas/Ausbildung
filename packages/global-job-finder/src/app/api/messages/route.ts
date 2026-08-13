import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const applications = await db.jobApplication.findMany({
    where: {
      userId: user.id,
      status: { not: 'SAVED' },
    },
    include: {
      jobOffer: true,
      messages: { orderBy: { sentAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const conversations = applications.map((application) => ({
    ...application,
    unreadCount: application.messages.filter(
      (message) => message.direction === 'INBOUND' && !message.readAt
    ).length,
    lastMessage: application.messages.at(-1) || null,
  }));

  return NextResponse.json({
    conversations,
    unreadCount: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
  });
}
