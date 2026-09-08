export interface AccountMail {
  to: string;
  subject: string;
  text: string;
}

export type MailSender = (mail: AccountMail) => Promise<void>;

export function createDevelopmentMailSender(baseUrl: string): MailSender {
  return async (mail) => {
    const response = await fetch(new URL('/api/v1/send', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: { Email: 'accounts@cat-care.test', Name: 'Cat Care' },
        To: [{ Email: mail.to }],
        Subject: mail.subject,
        Text: mail.text,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('The local account mailbox is unavailable.');
  };
}
