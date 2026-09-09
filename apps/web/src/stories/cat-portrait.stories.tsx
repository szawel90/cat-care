import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { CatPortraitResult } from '../components/cat-portrait-result';
import { observation } from './cat-fixtures';
const meta = {
  title: 'Cats/Portrait and intersections',
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
  args: { portrait: observation({ Q04: 'never', Q05: 'almost_always' }) },
  play: async ({ canvasElement }) => {
    const scale = canvasElement.querySelector('.cat-scale-card')!;
    await expect(scale.querySelector('.cat-scale-range')).not.toBeNull();
    await expect(scale.querySelector('.cat-scale-point')).toBeNull();
  },
};
export const UnobservedSpace: Story = {
  args: { portrait: observation({ Q15: 'unknown', Q16: 'unknown' }) },
  play: async ({ canvasElement }) => {
    const map = canvasElement.querySelectorAll('.cat-intersection')[3]!;
    await expect(map.querySelector('.cat-map-mark')).toBeNull();
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
