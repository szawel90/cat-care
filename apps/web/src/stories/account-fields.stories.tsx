import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { useTranslations } from 'next-intl';
import { EmailField, PasswordField } from '../components/account-fields';
import { Feedback } from '../components/feedback';
import { storyMessages } from './messages';

function AccountFields({
  disabled,
  newPassword,
  error,
}: {
  disabled: boolean;
  newPassword: boolean;
  error: boolean;
}) {
  const t = useTranslations('Account');
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {error && <Feedback tone="error">{t('invalidCredentials')}</Feedback>}
      <fieldset disabled={disabled}>
        <legend className="sr-only">{t('signIn')}</legend>
        <EmailField id="story-email" />
        <PasswordField id="story-password" newPassword={newPassword} />
      </fieldset>
    </form>
  );
}
const meta = {
  title: 'Forms/Account fields',
  component: AccountFields,
  args: { disabled: false, newPassword: false, error: false },
} satisfies Meta<typeof AccountFields>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SignIn: Story = {
  play: async ({ canvas, userEvent, globals }) => {
    const t = storyMessages(globals).Account;
    const email = canvas.getByLabelText(t.email) as HTMLInputElement;
    const password = canvas.getByLabelText(t.password) as HTMLInputElement;
    await userEvent.type(email, 'incorrect');
    await expect(email.validity.typeMismatch).toBe(true);
    await userEvent.clear(email);
    await userEvent.type(email, 'alex@example.test');
    await expect(email.validity.valid).toBe(true);
    await userEvent.type(password, 'Synthetic-password-123');
    await expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(canvas.getByRole('button', { name: t.showPassword }));
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Synthetic-password-123');
    await userEvent.click(canvas.getByRole('button', { name: t.hidePassword }));
    await expect(password).toHaveAttribute('type', 'password');
  },
};
export const NewPassword: Story = {
  args: { newPassword: true },
  play: async ({ canvas, globals }) => {
    const t = storyMessages(globals).Account;
    await expect(canvas.getByLabelText(t.password)).toHaveAttribute('minlength', '12');
    await expect(canvas.getByText(t.passwordHint)).toBeVisible();
  },
};
export const Error: Story = { args: { error: true } };
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, globals }) => {
    const t = storyMessages(globals).Account;
    await expect(canvas.getByLabelText(t.email)).toBeDisabled();
    await expect(canvas.getByLabelText(t.password)).toBeDisabled();
    await expect(canvas.getByRole('button')).toBeDisabled();
  },
};
export const PolishDark: Story = { ...SignIn, globals: { locale: 'pl', theme: 'dark' } };
