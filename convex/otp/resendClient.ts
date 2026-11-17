export interface OutgoingEmail {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function fromAddress(): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  return configured && configured.length > 0
    ? configured
    : 'onboarding@resend.dev';
}

export async function sendResendEmail(
  apiKey: string | undefined,
  email: OutgoingEmail,
): Promise<void> {
  if (apiKey === undefined || apiKey.trim().length === 0)
    throw new Error('AUTH_RESEND_KEY is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(email),
  });
  if (!response.ok)
    throw new Error(`Resend rejected the email (${response.status})`);
}
