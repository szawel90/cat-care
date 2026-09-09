import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { Button } from '../components/ui/button';
import { storyMessages } from './messages';

function TranslatedButton({ busy, ...props }: ComponentProps<typeof Button> & { busy?: boolean }) {
  const t = useTranslations('Account');
  return (
    <Button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy}
      className={props.variant === 'default' ? 'primary' : undefined}
    >
      {t(busy ? 'signingIn' : 'signIn')}
    </Button>
  );
}
const meta = {
  title: 'Controls/Button',
  component: TranslatedButton,
  args: { busy: false, disabled: false, variant: 'default', onClick: fn() },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline', 'secondary', 'ghost', 'link', 'destructive'],
    },
    onClick: { table: { disable: true } },
  },
} satisfies Meta<typeof TranslatedButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {
  play: async ({ canvas, userEvent, args, globals }) => {
    const button = canvas.getByRole('button', { name: storyMessages(globals).Account.signIn });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
export const Outline: Story = { args: { variant: 'outline' } };
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent, args }) => {
    const button = canvas.getByRole('button');
    await expect(button).toBeDisabled();
    await userEvent.tab();
    await expect(button).not.toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const Loading: Story = {
  args: { busy: true },
  play: async ({ canvas, globals }) => {
    await expect(
      canvas.getByRole('button', { name: storyMessages(globals).Account.signingIn }),
    ).toBeDisabled();
    await expect(canvas.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  },
};
export const PolishDark: Story = { ...Primary, globals: { locale: 'pl', theme: 'dark' } };
