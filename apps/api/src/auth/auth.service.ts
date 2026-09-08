import { Inject, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { PrismaService } from '../prisma.service';
import { getAuthSettings } from './auth-settings';
import { createAuth } from './create-auth';
import { AccessPolicy } from './access-policy';
import type { MailSender } from './mail-sender';

@Injectable()
export class AuthService {
  /** Account credentials are read by the API process at startup. */
  readonly settings = getAuthSettings();
  readonly auth;
  readonly access;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('ACCOUNT_MAIL_SENDER') sendMail: MailSender,
  ) {
    this.access = new AccessPolicy(prisma);
    this.auth = createAuth(prisma, this.settings, sendMail);
  }

  async currentUser(headers: IncomingHttpHeaders) {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) throw new UnauthorizedException('Please sign in to continue.');
    if (!(await this.access.hasAccess(session.user.id)))
      throw new ForbiddenException('Access is not available for this account.');
    return session;
  }
}
