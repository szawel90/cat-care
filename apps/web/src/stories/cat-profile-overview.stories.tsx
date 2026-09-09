import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { CatProfileOverview } from '../components/cat-profile-overview';
import { cats, observation } from './cat-fixtures';
import en from '../../messages/en.json';
const meta = {
  title: 'Cats/Compact profile',
  component: CatProfileOverview,
  args: { cat: cats[0]!, portrait: observation(), onIdentity: fn(), onArea: fn() },
  decorators: [
    (Story) => (
      <div className="cat-workspace">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatProfileOverview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Complete: Story = {
  play: async ({ canvasElement, userEvent, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('.cat-area-button')).toHaveLength(6);
    await expect(canvas.getByRole('button', { name: 'Health and mobility' })).toBeDisabled();
    const home = canvas.getByRole('button', {
      name: `${en.Cats.edit}: ${en.Cats.areas.home}`,
    });
    home.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onArea).toHaveBeenCalledWith('home');
  },
};
export const Empty: Story = { args: { portrait: null, cat: { ...cats[0]!, attributes: {} } } };
export const PendingPolishDark: Story = {
  globals: { locale: 'pl', theme: 'dark' },
  args: {
    portrait: observation({ Q04: 'deferred', Q07: 'deferred' }),
    cat: { ...cats[0]!, attributes: { games: ['balls'], handling: 'deferred' } },
  },
};
export const DeferredIdentity: Story = {
  args: { cat: { ...cats[0]!, attributes: { age: 'deferred' } }, portrait: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).not.toHaveTextContent('deferred');
    await expect(within(canvasElement).getAllByText(en.Cats.pending).length).toBeGreaterThan(0);
  },
};
export const LongName: Story = {
  args: {
    cat: { ...cats[0]!, name: 'A very long synthetic name for a small cat with a big profile' },
  },
};
