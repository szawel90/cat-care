import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { useTranslations } from 'next-intl';
import { Feedback } from '../components/feedback';
import type { AccountMessage } from '../i18n/messages';
import { storyMessages } from './messages';

function TranslatedFeedback({
  tone,
  message,
}: {
  tone: 'success' | 'error';
  message: AccountMessage;
}) {
  const t = useTranslations('Account');
  return <Feedback tone={tone}>{t(message)}</Feedback>;
}
const meta = {
  title: 'Feedback/Account message',
  component: TranslatedFeedback,
  args: { tone: 'success', message: 'profileUpdated' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['success', 'error'] },
    message: {
      control: 'select',
      options: [
        'profileUpdated',
        'genericError',
        'invalidCredentials',
        'resetRequested',
        'linkError',
      ],
    },
  },
  play: async ({ canvas, args, globals }) => {
    const message = canvas.getByRole(args.tone === 'error' ? 'alert' : 'status');
    await expect(message).toHaveTextContent(storyMessages(globals).Account[args.message]);
    await expect(message.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  },
} satisfies Meta<typeof TranslatedFeedback>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
export const Error: Story = { args: { tone: 'error', message: 'invalidCredentials' } };
export const LongMessage: Story = { args: { message: 'resetRequested' } };
export const PolishDark: Story = {
  args: { tone: 'error', message: 'linkError' },
  globals: { theme: 'dark', locale: 'pl' },
};
