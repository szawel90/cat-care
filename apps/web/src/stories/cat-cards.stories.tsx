import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { CatCards } from '../components/cat-cards';
import { cats } from './cat-fixtures';
const meta = {
  title: 'Cats/Profile cards',
  component: CatCards,
  args: { cats, selectedId: cats[0]!.id, onSelect: fn(), onAdd: fn() },
} satisfies Meta<typeof CatCards>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Collection: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Milo/ }));
    await expect(args.onSelect).toHaveBeenCalledWith(cats[1]!.id);
  },
};
export const Empty: Story = { args: { cats: [] } };
export const PolishDark: Story = { globals: { locale: 'pl', theme: 'dark' } };
