import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { AccountMenu } from '../components/account-menu';
import { storyMessages } from './messages';

const meta = {
  title: 'Navigation/Account menu',
  component: AccountMenu,
  args: {
    user: { name: 'Alex Example', email: 'alex@example.test' },
    busy: false,
    onSettings: fn(),
    onSignOut: fn(),
    onProfileClick: fn((event) => event.preventDefault()),
  },
  decorators: [
    (Story) => (
      <div className="workbench-menu">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Closed: Story = {};
export const Open: Story = {
  play: async ({ canvas, canvasElement, userEvent, globals }) => {
    const t = storyMessages(globals).Common;
    await userEvent.click(canvas.getByRole('button'));
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: t.settings })).toBeVisible();
    const profile = page
      .getAllByRole('menuitem')
      .find((item) => item.getAttribute('href') === '/account');
    await expect(profile).toBeDefined();
  },
};
export const SettingsAndEscape: Story = {
  play: async ({ canvas, canvasElement, userEvent, args, globals }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button');
    await userEvent.click(trigger);
    await userEvent.click(
      page.getByRole('menuitem', { name: storyMessages(globals).Common.settings }),
    );
    await expect(args.onSettings).toHaveBeenCalledTimes(1);
    await expect(args.onSignOut).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByRole('menu')).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button')).toBeDisabled();
  },
};
export const LongPolishDark: Story = {
  ...Open,
  globals: { locale: 'pl', theme: 'dark' },
  args: {
    user: {
      name: 'Aleksandra z bardzo długą nazwą wyświetlaną',
      email: 'alex.with.a.long.address@example.test',
    },
  },
};
