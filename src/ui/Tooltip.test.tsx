import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './index';
import { Tooltip } from './Tooltip';

describe('kit Tooltip (2026-10-22: replaces title= for detail)', () => {
  it('opens on hover over a kit Button, which holds no ref of its own', async () => {
    render(
      <Tooltip title="Re-reads git">
        <Button>Refresh</Button>
      </Tooltip>,
    );
    fireEvent.mouseOver(screen.getByRole('button', { name: 'Refresh' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Re-reads git');
  });

  it('opens over a disabled button too, through its wrapper', async () => {
    render(
      <Tooltip title="Only admins">
        <Button disabled>Sync</Button>
      </Tooltip>,
    );
    fireEvent.mouseOver(screen.getByRole('button', { name: 'Sync' }).parentElement!);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Only admins');
  });

  it('renders the child alone when there is nothing to say', () => {
    render(
      <Tooltip title={undefined}>
        <Button>Plain</Button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Plain' }).parentElement?.tagName).not.toBe('SPAN');
  });
});
