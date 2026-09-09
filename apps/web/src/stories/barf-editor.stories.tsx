import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { emptyBarfInput, snapshotBarf, type BarfSnapshot, type BarfInput } from '@cat-care/shared';
import { BarfEditor } from '../components/barf-editor';
import { storyMessages } from './messages';

function Workbench({
  initial,
  busy = false,
  readOnly = false,
  onSave,
  snapshot,
}: {
  initial: BarfInput;
  busy?: boolean;
  readOnly?: boolean;
  onSave: () => void;
  snapshot?: BarfSnapshot;
}) {
  const [input, setInput] = useState(initial);
  const [favorites, setFavorites] = useState<string[]>([]);
  return (
    <div style={{ maxWidth: 1100, margin: 'auto' }}>
      <BarfEditor
        input={input}
        snapshot={snapshot}
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

export const InventoryProposal: Story = {
  args: { initial: { ...filled, items: [{ ingredientId: 'meat-041', quantity: 1000 }] } },
  play: async ({ canvas, userEvent, globals }) => {
    const t = storyMessages(globals).Barf;
    await userEvent.selectOptions(canvas.getByLabelText(t.planMode), 'inventory');
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeDisabled();
    await expect(canvas.getByText(t.planBalanceAfter)).toBeVisible();
    await expect(canvas.getByRole('button', { name: t.print })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: t.shoppingList })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: t.planFind }));
    await waitFor(() => expect(canvas.getByRole('button', { name: t.planApply })).toBeVisible(), {
      timeout: 15000,
    });
    await expect(canvas.getByText(t.planIncomplete)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: t.planApply }));
    await expect(canvas.getByLabelText(t.planMode)).toHaveValue('recipe');
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeEnabled();
  },
};
export const InventoryPolishDark: Story = {
  ...InventoryProposal,
  globals: { locale: 'pl', theme: 'dark' },
};
export const BaseFoodsProposal: Story = {
  ...InventoryProposal,
  play: async ({ canvas, userEvent, globals }) => {
    const t = storyMessages(globals).Barf;
    await userEvent.selectOptions(canvas.getByLabelText(t.planMode), 'supplements');
    await expect(canvas.getByText(t.planFoodsHint)).toBeVisible();
    await expect(canvas.queryByLabelText(t.planBatch)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: t.planFind }));
    await waitFor(() => expect(canvas.getByRole('button', { name: t.planApply })).toBeVisible(), {
      timeout: 15000,
    });
    await expect(
      canvas.getByText(t.allMissingAssumption, { selector: '.barf-plan-summary p.barf-hint' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByText(t.planChecks, { selector: 'summary' }));
    await expect(canvas.queryByText(t['planStatus_missing-data'])).not.toBeInTheDocument();
    await expect(
      canvas.getAllByText(/Deviation from target:|Odchylenie od celu:/).length,
    ).toBeGreaterThan(20);
    await userEvent.click(canvas.getByRole('button', { name: t.planApply }));
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeEnabled();
  },
};
export const StockConflictAndRetry: Story = {
  ...InventoryProposal,
  play: async ({ canvas, userEvent, globals }) => {
    const t = storyMessages(globals).Barf;
    await userEvent.selectOptions(canvas.getByLabelText(t.planMode), 'inventory');
    const batch = canvas.getByLabelText(t.planBatch);
    await userEvent.clear(batch);
    await userEvent.type(batch, '500');
    await userEvent.click(canvas.getByRole('button', { name: t.planFind }));
    await waitFor(() => expect(canvas.getByText(t.planNoProposal)).toBeVisible(), {
      timeout: 15000,
    });
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(canvas.queryByText(t.planNoProposal)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: t.planFind }));
    await waitFor(() => expect(canvas.getByRole('button', { name: t.planApply })).toBeVisible(), {
      timeout: 15000,
    });
  },
};
export const FoodModePreservesEnteredSupplements: Story = {
  args: {
    initial: {
      ...filled,
      items: [...filled.items, { ingredientId: 'supplement-016', quantity: 2 }],
    },
  },
  play: async ({ canvas, userEvent, globals }) => {
    const t = storyMessages(globals).Barf;
    await userEvent.selectOptions(canvas.getByLabelText(t.planMode), 'supplements');
    await expect(canvas.getByText(t.planRemoveSupplements)).toBeVisible();
    await expect(canvas.getByRole('button', { name: t.planFind })).toBeDisabled();
    await userEvent.selectOptions(canvas.getByLabelText(t.planMode), 'recipe');
    await expect(canvas.getByRole('button', { name: t.saveRecipe })).toBeEnabled();
  },
};

const historicalTaurine = snapshotBarf({
  ...filled,
  items: [{ ingredientId: 'meat-041', quantity: 1000 }],
});
historicalTaurine.input.engineVersion = 'barf-1.9c-corrected-v1';
delete historicalTaurine.result.taurineZeroAssumption;
delete historicalTaurine.result.missingValuesAssumption;
export const LegacyMissingTaurine: Story = {
  args: { initial: historicalTaurine.input, snapshot: historicalTaurine, readOnly: true },
  play: async ({ canvas, globals }) => {
    const t = storyMessages(globals).Barf;
    await expect(canvas.queryByText(t.taurineAssumedZero)).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/Calculation assumption:|Założenie obliczeniowe:/),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText('barf-1.9c-data-v1 · barf-1.9c-corrected-v1', { selector: '.barf-hint' }),
    ).toBeInTheDocument();
  },
};
