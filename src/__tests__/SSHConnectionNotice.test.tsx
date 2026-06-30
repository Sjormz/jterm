import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SSHConnectionNotice from '../renderer/components/SSHConnectionNotice';

describe('SSHConnectionNotice', () => {
  it('renders a connected-state banner when visible', () => {
    render(<SSHConnectionNotice visible label="test.example.com" />);

    expect(screen.getByTestId('ssh-terminal-notice')).toBeInTheDocument();
    expect(screen.getByText('Connected to test.example.com')).toBeInTheDocument();
    expect(screen.getByText('Waiting for shell output…')).toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<SSHConnectionNotice visible={false} />);
    expect(container.querySelector('[data-testid="ssh-terminal-notice"]')).toBeNull();
  });
});
