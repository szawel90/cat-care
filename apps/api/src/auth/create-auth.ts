import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { PrismaService } from '../prisma.service';
import { AccessPolicy, ACCESS_DENIED } from './access-policy';
import { normalizeEmail, type AuthSettings } from './auth-settings';
import type { MailSender } from './mail-sender';
import { createHash } from 'node:crypto';

export function createAuth(prisma: PrismaService, settings: AuthSettings, sendMail: MailSender) {
  const access = new AccessPolicy(prisma);
  const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
  async function rememberEmail(token: string, userId: string, targetEmail: string) {
    await prisma.emailAction.upsert({
      where: { tokenHash: tokenHash(token) },
      create: {
        tokenHash: tokenHash(token),
        userId,
        targetEmail: normalizeEmail(targetEmail),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      update: {},
    });
  }
  const protectedPaths = new Set([
    '/update-user',
    '/change-password',
    '/list-sessions',
    '/revoke-session',
    '/revoke-sessions',
    '/revoke-other-sessions',
    '/list-accounts',
    '/link-social',
    '/unlink-account',
    '/delete-user',
    '/delete-user/callback',
    '/change-email',
    '/get-access-token',
    '/refresh-token',
    '/account-info',
  ]);
  const options: BetterAuthOptions = {
    appName: 'Cat Care',
    baseURL: settings.baseUrl,
    basePath: '/api/auth',
    secret: settings.secret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    trustedOrigins: [settings.baseUrl],
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: settings.baseUrl.startsWith('https:'),
      },
    },
    user: {
      fields: { name: 'displayName' },
      validateUserInfo: async ({ user, source }, context) => {
        if (source.action === 'link-account') {
          const current = await auth.api.getSession({ headers: context?.headers ?? new Headers() });
          if (
            !current ||
            current.user.id !== user.id ||
            Date.now() - current.session.createdAt.getTime() > 300_000
          )
            return {
              error: 'reauthentication_required',
              errorDescription: 'Sign in again before connecting Google.',
            };
        }
        if (source.method === 'oauth' && (!user.email || user.emailVerified !== true))
          return {
            error: 'email_verification_required',
            errorDescription:
              'Use email registration to verify your address before linking Google.',
          };
        if (source.action === 'link-account' && (!user.id || !(await access.hasAccess(user.id))))
          return { error: 'access_unavailable', errorDescription: ACCESS_DENIED };
        if (
          source.action === 'create-user' &&
          (!user.email || !(await access.mayRegister(user.email)))
        ) {
          return { error: 'access_unavailable', errorDescription: ACCESS_DENIED };
        }
      },
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
          await rememberEmail(token, user.id, newEmail);
          await sendMail({
            to: user.email,
            subject: 'Approve your Cat Care email change',
            text: `Approve changing your email address to ${newEmail}:\n\n${url}\n\nThen confirm the link sent to your new address.`,
          });
        },
      },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 3600,
        sendDeleteAccountVerification: async ({ user, url }) =>
          sendMail({
            to: user.email,
            subject: 'Confirm Cat Care account deletion',
            text: `This permanently deletes your account. Confirm only if you requested it:\n\n${url}`,
          }),
        beforeDelete: async (user) => {
          await access.requireAccess(user.id);
          await prisma.$transaction([
            prisma.accessApproval.updateMany({
              where: { userId: user.id },
              data: { status: 'REVOKED' },
            }),
            prisma.authVerification.deleteMany({ where: { value: user.id } }),
            prisma.emailAction.deleteMany({ where: { userId: user.id } }),
          ]);
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendMail({
          to: user.email,
          subject: 'Reset your Cat Care password',
          text: `Use this one-time link to reset your password:\n\n${url}\n\nIf you did not request this, you can ignore this message.`,
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url, token }) => {
        await rememberEmail(token, user.id, user.email);
        await sendMail({
          to: user.email,
          subject: 'Verify your Cat Care email',
          text: `Confirm your email address to continue to Cat Care:\n\n${url}\n\nIf you did not request this, you can ignore this message.`,
        });
      },
      afterEmailVerification: async (user) => {
        const previous = await prisma.accessApproval.findUnique({ where: { userId: user.id } });
        if (!previous || previous.email === user.email) return;
        await prisma.$transaction(async (tx) => {
          await tx.accessApproval.update({
            where: { id: previous.id },
            data: { userId: null, status: 'REVOKED' },
          });
          const changed = await tx.accessApproval.updateMany({
            where: { email: normalizeEmail(user.email), status: 'ACTIVE', userId: null },
            data: { userId: user.id },
          });
          if (changed.count !== 1) throw new APIError('FORBIDDEN', { message: ACCESS_DENIED });
          await tx.authSession.deleteMany({ where: { userId: user.id } });
          await tx.emailAction.deleteMany({ where: { userId: user.id } });
          await tx.authVerification.deleteMany({ where: { value: user.id } });
        });
      },
    },
    socialProviders: settings.google
      ? {
          google: {
            ...settings.google,
            includeGrantedScopes: false,
            mapProfileToUser: () => ({ image: undefined }),
          },
        }
      : {},
    account: {
      modelName: 'authAccount',
      encryptOAuthTokens: true,
      storeStateStrategy: 'database',
      storeAccountCookie: false,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowUnlinkingAll: false },
    },
    session: {
      modelName: 'authSession',
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 300,
      cookieCache: { enabled: false },
    },
    verification: { modelName: 'authVerification' },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'authRateLimit',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: { ...account, idToken: null } }) },
        update: { before: async (account) => ({ data: { ...account, idToken: null } }) },
      },
      user: {
        create: {
          before: async (user) => {
            if (!user.name.trim() || user.name.trim().length > 60)
              throw new APIError('BAD_REQUEST', {
                message: 'Enter a display name between 1 and 60 characters.',
              });
            return {
              data: {
                ...user,
                email: normalizeEmail(user.email),
                name: user.name.trim(),
                image: null,
              },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            await access.bindVerifiedUser(session.userId);
            return { data: session };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          Array.isArray(ctx.body?.scopes) &&
          ctx.body.scopes.some(
            (scope: unknown) => !['openid', 'email', 'profile'].includes(String(scope)),
          )
        )
          throw new APIError('BAD_REQUEST', { message: 'Only identity scopes are supported.' });
        for (const key of ['callbackURL', 'errorCallbackURL', 'newUserCallbackURL', 'redirectTo']) {
          const target = ctx.body?.[key] ?? ctx.query?.[key];
          if (
            typeof target === 'string' &&
            new URL(target, settings.baseUrl).origin !== settings.baseUrl
          )
            throw new APIError('FORBIDDEN', { message: 'This redirect is not allowed.' });
        }
        if (ctx.path === '/verify-email') {
          const token = ctx.query?.token;
          if (typeof token !== 'string')
            throw new APIError('BAD_REQUEST', {
              message: 'This email link is invalid or expired.',
            });
          const hash = tokenHash(token);
          const action = await prisma.emailAction.findUnique({
            where: { tokenHash: hash },
            include: { user: true },
          });
          if (!action || action.expiresAt.getTime() <= Date.now() || action.user.deletedAt)
            throw new APIError('BAD_REQUEST', {
              message: 'This email link is invalid or expired.',
            });
          if (action.targetEmail !== action.user.email) {
            await access.requireAccess(action.userId);
            if (!(await access.mayRegister(action.targetEmail)))
              throw new APIError('FORBIDDEN', { message: ACCESS_DENIED });
          }
          const consumed = await prisma.emailAction.deleteMany({ where: { tokenHash: hash } });
          if (consumed.count !== 1)
            throw new APIError('BAD_REQUEST', { message: 'This email link was already used.' });
        }
        if (!protectedPaths.has(ctx.path)) return;
        const current = await auth.api.getSession({ headers: ctx.headers ?? new Headers() });
        if (!current)
          throw new APIError('UNAUTHORIZED', { message: 'Please sign in to continue.' });
        await access.requireAccess(current.user.id);
        if (
          ctx.path === '/change-email' &&
          (typeof ctx.body?.newEmail !== 'string' || !(await access.mayRegister(ctx.body.newEmail)))
        )
          throw new APIError('FORBIDDEN', { message: ACCESS_DENIED });
        if (ctx.path === '/update-user') {
          const name = ctx.body?.name;
          if (
            typeof name !== 'string' ||
            name.trim().length < 1 ||
            name.trim().length > 60 ||
            ctx.body?.image
          ) {
            throw new APIError('BAD_REQUEST', {
              message: 'Enter a display name between 1 and 60 characters.',
            });
          }
        }
        if (
          ['/link-social', '/unlink-account', '/delete-user', '/change-email'].includes(ctx.path)
        ) {
          if (Date.now() - current.session.createdAt.getTime() > 300_000) {
            throw new APIError('FORBIDDEN', {
              message: 'Sign in again before changing account security.',
            });
          }
        }
        if (ctx.path === '/update-user')
          return { context: { ...ctx, body: { ...ctx.body, name: ctx.body.name.trim() } } };
        if (ctx.path === '/change-password')
          return { context: { ...ctx, body: { ...ctx.body, revokeOtherSessions: true } } };
      }),
    },
    logger: { disabled: true },
  };
  const auth: ReturnType<typeof betterAuth> = betterAuth(options);
  return auth;
}
