import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within, waitFor } from 'storybook/test';
import { useTranslations } from 'next-intl';
import { useUnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { Button } from '../components/ui/button';
import { storyMessages } from './messages';

function UnsavedChanges({ onDecision }: { onDecision: (discard: boolean) => void }) {
  const t = useTranslations('Common');
  const { confirmDiscard, dialog } = useUnsavedChangesDialog();
  return (
    <>
      <Button onClick={async () => onDecision(await confirmDiscard())}>{t('settings')}</Button>
      {dialog}
    </>
  );
}
const meta = {
  title: 'Feedback/Unsaved changes',
  component: UnsavedChanges,
  args: { onDecision: fn() },
} satisfies Meta<typeof UnsavedChanges>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {
  play: async ({ canvas, canvasElement, userEvent, globals }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      page.getByRole('dialog', { name: storyMessages(globals).Unsaved.title }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: storyMessages(globals).Unsaved.keep }),
    ).toHaveFocus();
  },
};
export const KeepEditing: Story = {
  play: async ({ canvas, canvasElement, userEvent, args, globals }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button');
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('button', { name: storyMessages(globals).Unsaved.keep }));
    await expect(args.onDecision).toHaveBeenCalledWith(false);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Discard: Story = {
  play: async ({ canvas, canvasElement, userEvent, args, globals }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button'));
    await userEvent.click(
      page.getByRole('button', { name: storyMessages(globals).Unsaved.discard }),
    );
    await expect(args.onDecision).toHaveBeenCalledWith(true);
  },
};
export const EscapeKeepsEdits: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const trigger = canvas.getByRole('button');
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await expect(args.onDecision).toHaveBeenCalledWith(false);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const PolishDark: Story = { ...Open, globals: { theme: 'dark', locale: 'pl' } };
