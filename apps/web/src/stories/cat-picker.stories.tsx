import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { CatPicker } from '../components/cat-picker';
import { cats } from './cat-fixtures';
import { storyMessages } from './messages';
const meta = {
  title: 'Cats/Active cat picker',
  component: CatPicker,
  args: {
    cats,
    selectedId: cats[0]!.id,
    status: 'ready',
    onSelect: fn(),
    onAdd: fn(),
    onRetry: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(340px, 100%)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Many: Story = {};
export const FirstCat: Story = {
  args: { cats: [], selectedId: null },
  play: async ({ canvas, userEvent, args, globals }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: storyMessages(globals).Cats.addFirst }),
    );
    await expect(args.onAdd).toHaveBeenCalledTimes(1);
  },
};
export const OneStillOffersAdd: Story = {
  args: { cats: cats.slice(0, 1) },
  play: async ({ canvas, canvasElement, userEvent, args, globals }) => {
    await userEvent.click(canvas.getByRole('button'));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('menuitem', {
        name: storyMessages(globals).Cats.addAnother,
      }),
    );
    await expect(args.onAdd).toHaveBeenCalledTimes(1);
  },
};
export const SelectAndEscape: Story = {
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    const button = canvas.getByRole('button');
    await userEvent.click(button);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('menuitem', { name: 'Milo' }));
    await expect(args.onSelect).toHaveBeenCalledWith(cats[1]!.id);
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByRole('menu')).not.toBeInTheDocument();
    await expect(button).toHaveFocus();
  },
};
export const Loading: Story = { args: { status: 'loading' } };
export const Retry: Story = {
  args: { status: 'error' },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button'));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};
export const LongPolishDark: Story = {
  globals: { locale: 'pl', theme: 'dark' },
  args: { cats: [{ ...cats[0]!, name: 'Luna o bardzo długim i wyjątkowym imieniu' }] },
};
