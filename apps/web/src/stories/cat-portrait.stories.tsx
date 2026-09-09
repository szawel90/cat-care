import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { CatPortraitResult } from '../components/cat-portrait-result';
import { observation } from './cat-fixtures';
const meta = {
  title: 'Cats/Portrait descriptions',
  component: CatPortraitResult,
  args: { portrait: observation(), onEdit: fn() },
  decorators: [
    (Story) => (
      <div className="cat-workspace">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatPortraitResult>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Complete: Story = {};
export const DeferredAnswer: Story = {
  args: { portrait: observation({ Q04: 'deferred' }) },
  play: async ({ canvasElement, userEvent, args }) => {
    const pending = within(canvasElement.querySelector('.cat-pending') as HTMLElement);
    await userEvent.click(pending.getByRole('button'));
    await expect(args.onEdit).toHaveBeenCalledWith('Q04');
  },
};
export const RangeWithoutMidpoint: Story = {
  args: { portrait: observation({ Q04: 'never', Q05: 'joins_play' }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-trait="activity"]')).toHaveAttribute(
      'data-band',
      'varied',
    );
    await expect(canvasElement.querySelector('.cat-scale-track')).toBeNull();
  },
};
export const UnobservedSpace: Story = {
  args: { portrait: observation({ Q15: 'deferred', Q16: 'deferred' }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-trait="height"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-trait="openness"]')).toBeNull();
  },
};
export const ContextPolishDark: Story = {
  globals: { locale: 'pl', theme: 'dark' },
  args: {
    portrait: {
      ...observation({ Q01: 'health', Q04: 'deferred' }),
      contextChangedAt: '2026-09-09T12:00:00Z',
    },
  },
};
