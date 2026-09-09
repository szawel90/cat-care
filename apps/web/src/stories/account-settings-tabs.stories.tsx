import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AccountSettingsTabs } from '../components/account-settings-tabs';
import { TabsContent } from '../components/ui/tabs';
import { EmailField, PasswordField } from '../components/account-fields';
import { storyMessages } from './messages';

function SettingsTabs({
  disabled,
  onValueChange,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslations('Account');
  const [value, setValue] = useState('profile');
  return (
    <AccountSettingsTabs
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
      disabled={disabled}
    >
      <TabsContent value="profile">
        <EmailField id="story-profile-email" />
      </TabsContent>
      <TabsContent value="security">
        <PasswordField id="story-new-password" newPassword />
      </TabsContent>
      <TabsContent value="data">
        <p>{t('deleteHelp')}</p>
      </TabsContent>
    </AccountSettingsTabs>
  );
}
const meta = {
  title: 'Navigation/Settings tabs',
  component: SettingsTabs,
  args: { disabled: false, onValueChange: fn() },
} satisfies Meta<typeof SettingsTabs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ManualKeyboardActivation: Story = {
  play: async ({ canvas, userEvent, args, globals }) => {
    const t = storyMessages(globals).Account;
    const profile = canvas.getByRole('tab', { name: t.profile });
    const security = canvas.getByRole('tab', { name: t.security });
    await userEvent.click(profile);
    const top = profile.getBoundingClientRect().top;
    await userEvent.keyboard('{ArrowRight}');
    await expect(security).toHaveFocus();
    await expect(profile).toHaveAttribute('aria-selected', 'true');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect(security).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByLabelText(t.password)).toBeVisible();
    await expect(args.onValueChange).toHaveBeenCalledWith('security');
    await expect(Math.abs(profile.getBoundingClientRect().top - top)).toBeLessThan(1);
  },
};
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    for (const tab of canvas.getAllByRole('tab')) await expect(tab).toBeDisabled();
  },
};
export const PolishDark: Story = {
  ...ManualKeyboardActivation,
  globals: { locale: 'pl', theme: 'dark' },
};
