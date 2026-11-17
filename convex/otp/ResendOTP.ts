import {Email} from '@convex-dev/auth/providers/Email';
import type {GenericActionCtxWithAuthConfig} from '@convex-dev/auth/server';
import {alphabet, generateRandomString} from 'oslo/crypto';

import {
  EMAIL_OTP_PROVIDER_IDS,
  type EmailOtpProviderId,
} from '../../shared/authPolicy';
import {normalizeEmail} from '../../shared/email';
import {internal} from '../_generated/api';
import type {DataModel} from '../_generated/dataModel';
import type {AppLocale} from '../schema/userProfiles';
import {appError} from '../lib/errors';
import {emailTemplates} from './emailTemplates';
import {tryApplyFixedOtp} from './fixedOtp';
import {fromAddress, sendResendEmail} from './resendClient';

const OTP_MAX_AGE_SECONDS = 10 * 60;

function createOtpProvider(id: EmailOtpProviderId, locale: AppLocale) {
  return Email<DataModel>({
    id,
    apiKey: process.env.AUTH_RESEND_KEY,
    maxAge: OTP_MAX_AGE_SECONDS,
    async generateVerificationToken(): Promise<string> {
      return generateRandomString(8, alphabet('0-9'));
    },
    async authorize(params, account): Promise<void> {
      const email = typeof params.email === 'string' ? params.email : undefined;
      if (email === undefined || normalizeEmail(email) !== email)
        throw appError('INVALID_INPUT', 'error.auth.otp.email');
      if (account.providerAccountId !== email)
        throw appError('INVALID_INPUT', 'error.auth.otp.mismatch');
    },
    async sendVerificationRequest(
      {identifier: email, provider, token},
      ctx?: GenericActionCtxWithAuthConfig<DataModel>,
    ): Promise<void> {
      if (ctx === undefined)
        throw new Error('OTP provider requires action ctx');
      await ctx.runMutation(internal.otp.limits.consumeOtpRequest, {email});
      if (await tryApplyFixedOtp(ctx, email, token, provider.id)) return;
      if (process.env.ENVIRONMENT !== 'production') {
        console.warn(`Development OTP for ${email}: ${token}`);
        if (!process.env.AUTH_RESEND_KEY) return;
      }
      const template = emailTemplates[locale];
      await sendResendEmail(provider.apiKey, {
        from: `BooKoo <${fromAddress()}>`,
        to: [email],
        subject: template.subject,
        text: template.text(token),
        html: template.html(token),
      });
    },
  });
}

export const BooKooOtpEn = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.en, 'en');
export const BooKooOtpKo = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.ko, 'ko');
export const BooKooOtpJa = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.ja, 'ja');
export const BooKooOtpZh = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.zh, 'zh');
export const BooKooOtpId = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.id, 'id');
export const BooKooOtpDe = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.de, 'de');
export const BooKooOtpEs = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.es, 'es');
export const BooKooOtpFr = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.fr, 'fr');
export const BooKooOtpIt = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.it, 'it');
export const BooKooOtpNl = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.nl, 'nl');
export const BooKooOtpPt = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.pt, 'pt');
export const BooKooOtpVi = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.vi, 'vi');
