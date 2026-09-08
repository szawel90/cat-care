import { localizedMail, mailLanguage } from '../src/auth/localized-mail';
describe('Localized account email', () => {
  it('uses the saved choice before request language and validates automatic hints', () => {
    expect(mailLanguage('pl', 'en')).toBe('pl');
    expect(mailLanguage('en', 'pl')).toBe('en');
    expect(mailLanguage('system', 'pl')).toBe('pl');
    expect(mailLanguage(undefined, '<script>')).toBe('en');
  });
  it('preserves exact action URLs and email targets in both languages', () => {
    const url = 'https://example.test/verify?token=synthetic%2Btoken';
    for (const locale of ['en', 'pl'] as const) {
      for (const kind of ['verify', 'reset', 'change', 'delete'] as const) {
        const mail = localizedMail(kind, locale, url, 'new@example.test');
        expect(mail.text.match(/https?:\/\/\S+/g)).toEqual([url]);
        if (kind === 'change') expect(mail.text).toContain('new@example.test');
      }
    }
    expect(localizedMail('delete', 'pl', url).text).toContain('trwale usuwa');
  });
});
