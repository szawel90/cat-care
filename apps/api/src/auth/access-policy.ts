import { APIError } from 'better-auth/api';
import type { PrismaService } from '../prisma.service';
import { normalizeEmail } from './auth-settings';

export const ACCESS_DENIED = 'Access is not available for this account.';

export class AccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async mayRegister(email: string): Promise<boolean> {
    const approval = await this.prisma.accessApproval.findUnique({
      where: { email: normalizeEmail(email) },
    });
    return approval?.status === 'ACTIVE' && !approval.userId;
  }

  async bindVerifiedUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.emailVerified || user.deletedAt) this.deny();
    const linked = await this.prisma.accessApproval.findUnique({ where: { userId } });
    if (linked) {
      if (linked.status !== 'ACTIVE') this.deny();
      return;
    }
    const result = await this.prisma.accessApproval.updateMany({
      where: { email: normalizeEmail(user.email), status: 'ACTIVE', userId: null },
      data: { userId },
    });
    if (!result.count) {
      const concurrent = await this.prisma.accessApproval.findUnique({ where: { userId } });
      if (concurrent?.status !== 'ACTIVE') this.deny();
    }
  }

  async hasAccess(userId: string): Promise<boolean> {
    const approval = await this.prisma.accessApproval.findUnique({
      where: { userId },
      include: { user: { select: { email: true, emailVerified: true, deletedAt: true } } },
    });
    return (
      approval?.status === 'ACTIVE' &&
      approval.user?.emailVerified === true &&
      approval.email === approval.user.email &&
      !approval.user.deletedAt
    );
  }

  async requireAccess(userId: string): Promise<void> {
    if (!(await this.hasAccess(userId))) this.deny();
  }

  private deny(): never {
    throw new APIError('FORBIDDEN', { code: 'ACCESS_UNAVAILABLE', message: ACCESS_DENIED });
  }
}
