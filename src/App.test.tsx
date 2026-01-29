import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('AI Agent Workbench')).toBeInTheDocument();
  });

  it('displays welcome message', () => {
    render(<App />);
    expect(
      screen.getByText(/The AI Agent Workbench is being built/i)
    ).toBeInTheDocument();
  });

  it('shows planned features list', () => {
    render(<App />);
    expect(screen.getByText(/Free Agent Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Workflow Builder/i)).toBeInTheDocument();
    expect(screen.getByText(/Multi-user Collaboration/i)).toBeInTheDocument();
  });

  it('has a session control button', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: /Start Session/i });
    expect(button).toBeInTheDocument();
  });
});
