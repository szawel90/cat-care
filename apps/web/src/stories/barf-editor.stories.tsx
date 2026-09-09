import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { emptyBarfInput, type BarfInput } from '@cat-care/shared';
import { BarfEditor } from '../components/barf-editor';
import { storyMessages } from './messages';

function Workbench({
  initial,
  busy = false,
  readOnly = false,
  onSave,
}: {
  initial: BarfInput;
  busy?: boolean;
  readOnly?: boolean;
  onSave: () => void;
}) {
  const [input, setInput] = useState(initial);
  const [favorites, setFavorites] = useState<string[]>([]);
  return (
    <div style={{ maxWidth: 1100, margin: 'auto' }}>
      <BarfEditor
        input={input}
        onChange={setInput}
        favorites={favorites}
        onFavorite={(id) =>
          setFavorites((list) =>
            list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
          )
        }
        onSave={onSave}
        busy={busy}
        readOnly={readOnly}
      />
    </div>
  );
}
const filled = {
  ...emptyBarfInput(),
  title: 'Synthetic recipe',
  catName: 'Luna',
  items: [
    { ingredientId: 'meat-076', quantity: 1000 },
    { ingredientId: 'water', quantity: 300 },
  ],
};
const meta = {
  title: 'Nutrition/BARF editor',
  component: Workbench,
  args: { initial: filled, busy: false, readOnly: false, onSave: fn() },
} satisfies Meta<typeof Workbench>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {
  args: { initial: emptyBarfInput() },
  play: async ({ canvas, globals }) => {
    const t = storyMessages(globals).Barf;
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeDisabled();
    await expect(canvas.getByText(t.emptyIngredients)).toBeVisible();
  },
};
export const EditAndSave: Story = {
  play: async ({ canvas, userEvent, args, globals }) => {
    const t = storyMessages(globals).Barf;
    const weight = canvas.getByLabelText(t.catWeight);
    await userEvent.clear(weight);
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeDisabled();
    await userEvent.type(weight, '5');
    await userEvent.click(canvas.getByRole('button', { name: t.saveRecipe }));
    await expect(args.onSave).toHaveBeenCalled();
    await userEvent.click(
      canvas.getByText(t.nutrientDetails, { exact: true, selector: 'summary' }),
    );
    await expect(canvas.getByRole('table')).toBeVisible();
  },
};
export const SearchWithKeyboard: Story = {
  play: async ({ canvas, userEvent, globals }) => {
    const t = storyMessages(globals).Barf;
    const search = canvas.getByLabelText(t.search);
    await userEvent.type(search, 'Lunderland');
    const select = canvas.getByLabelText(t.ingredient);
    await userEvent.selectOptions(select, 'supplement-019');
    await userEvent.click(canvas.getByRole('button', { name: t.addFavorite }));
    await expect(canvas.getByRole('button', { name: t.removeFavorite })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(canvas.getByRole('button', { name: t.add }));
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeEnabled();
    await userEvent.tab();
  },
};
export const PolishDark: Story = { ...EditAndSave, globals: { locale: 'pl', theme: 'dark' } };
export const Saving: Story = {
  args: { busy: true },
  play: async ({ canvas, globals }) => {
    const t = storyMessages(globals).Barf;
    await expect(canvas.getByLabelText(t.recipeName)).toBeDisabled();
    await expect(canvas.getByRole('button', { name: t.saving })).toBeDisabled();
  },
};
export const History: Story = {
  args: { readOnly: true },
  play: async ({ canvas, globals }) => {
    const t = storyMessages(globals).Barf;
    await expect(canvas.getByLabelText(t.recipeName)).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: t.saveRecipe })).not.toBeInTheDocument();
  },
};
