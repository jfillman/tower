import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CloudPromoteDialog } from './CloudPromoteDialog';

const submit = jest.fn(async () => ({ prUrl: 'https://github.com/o/fn/pull/9', alreadyOpen: false }));
let state: Record<string, unknown> = {};
jest.mock('../../environments/releasePins', () => ({
  useSubmitPin: () => ({ loading: false, ...state, submit, reset: jest.fn() }),
}));

const IMAGE = 'ghcr.io/o/fn:0.1.0-dac9953';

describe('CloudPromoteDialog', () => {
  beforeEach(() => {
    submit.mockClear();
    state = {};
  });

  it('promotes a Flight environment by release pin PR on the app repo, not a gitops repo', async () => {
    const onDone = jest.fn();
    render(<CloudPromoteDialog owner="o" appName="fn" target={{ image: IMAGE, from: 'dev', env: 'prod', flight: true }} onClose={jest.fn()} onDone={onDone} />);
    expect(screen.getByText('glidepath/releases/prod.yaml')).toBeTruthy();
    expect(screen.getByText('o/fn')).toBeTruthy();
    expect(screen.queryByText(/gitops-/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open pin PR' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({ owner: 'o', appName: 'fn', env: 'prod', image: IMAGE, promotedFrom: 'dev' });
  });

  it('explains that a Ground environment of a cloud app has nothing to promote', () => {
    render(<CloudPromoteDialog owner="o" appName="fn" target={{ image: IMAGE, env: 'dev', flight: false }} onClose={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText(/nothing to promote/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open pin PR' })).toBeNull();
  });

  it('shows the pull request once opened', () => {
    state = { result: { prUrl: 'https://github.com/o/fn/pull/9', alreadyOpen: false } };
    render(<CloudPromoteDialog owner="o" appName="fn" target={{ image: IMAGE, env: 'prod', flight: true }} onClose={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText('https://github.com/o/fn/pull/9')).toBeTruthy();
  });
});
