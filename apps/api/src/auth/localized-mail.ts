type MailLanguage = 'en' | 'pl';
type MailKind = 'verify' | 'reset' | 'change' | 'delete';

export function mailLanguage(
  saved: string | undefined,
  requested: string | null | undefined,
): MailLanguage {
  if (saved === 'en' || saved === 'pl') return saved;
  return requested === 'pl' ? 'pl' : 'en';
}

export function localizedMail(kind: MailKind, language: MailLanguage, url: string, newEmail = '') {
  const templates = {
    en: {
      verify: {
        subject: 'Verify your Cat Care email',
        text: `Confirm your email address to continue to Cat Care:\n\n${url}\n\nIf you did not request this, you can ignore this message.`,
      },
      reset: {
        subject: 'Reset your Cat Care password',
        text: `Use this one-time link to reset your password:\n\n${url}\n\nIf you did not request this, you can ignore this message.`,
      },
      change: {
        subject: 'Approve your Cat Care email change',
        text: `Approve changing your email address to ${newEmail}:\n\n${url}\n\nThen confirm the link sent to your new address.`,
      },
      delete: {
        subject: 'Confirm Cat Care account deletion',
        text: `This permanently deletes your account. Confirm only if you requested it:\n\n${url}`,
      },
    },
    pl: {
      verify: {
        subject: 'Potwierdź adres e-mail w Cat Care',
        text: `Potwierdź swój adres e-mail, aby korzystać z Cat Care:\n\n${url}\n\nJeśli to nie Ty prosisz o potwierdzenie, możesz zignorować tę wiadomość.`,
      },
      reset: {
        subject: 'Zmień hasło do Cat Care',
        text: `Użyj tego jednorazowego odnośnika, aby ustawić nowe hasło:\n\n${url}\n\nJeśli to nie Ty prosisz o zmianę, możesz zignorować tę wiadomość.`,
      },
      change: {
        subject: 'Zatwierdź zmianę adresu e-mail w Cat Care',
        text: `Zatwierdź zmianę adresu e-mail na ${newEmail}:\n\n${url}\n\nNastępnie potwierdź odnośnik wysłany na nowy adres.`,
      },
      delete: {
        subject: 'Potwierdź usunięcie konta Cat Care',
        text: `Ta operacja trwale usuwa Twoje konto. Potwierdź ją tylko wtedy, gdy to Twoja decyzja:\n\n${url}`,
      },
    },
  };
  return templates[language][kind];
}
