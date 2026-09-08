import { loadEnvironment } from './environment';
import { PrismaService } from './prisma.service';
import { normalizeEmail } from './auth/auth-settings';

async function main() {
  const [action, address] = process.argv.slice(2);
  if (
    !['approve', 'revoke'].includes(action ?? '') ||
    !address ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
  ) {
    throw new Error('Usage: pnpm pilot:access <approve|revoke> <email>');
  }
  loadEnvironment();
  const prisma = new PrismaService();
  try {
    const email = normalizeEmail(address);
    await prisma.$transaction(async (tx) => {
      const approval = await tx.accessApproval.upsert({
        where: { email },
        create: { email, status: action === 'approve' ? 'ACTIVE' : 'REVOKED' },
        update: { status: action === 'approve' ? 'ACTIVE' : 'REVOKED' },
      });
      if (action === 'revoke' && approval.userId)
        await tx.authSession.deleteMany({ where: { userId: approval.userId } });
    });
    console.log('Pilot access updated.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(
    error instanceof Error && error.message.startsWith('Usage:')
      ? error.message
      : 'Pilot access update failed.',
  );
  process.exitCode = 1;
});
