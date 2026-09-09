import { messagesFor } from '../i18n/messages';

export function storyMessages(globals: Record<string, unknown>) {
  return messagesFor(globals.locale === 'pl' ? 'pl' : 'en');
}
