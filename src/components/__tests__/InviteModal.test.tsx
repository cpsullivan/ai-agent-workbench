/**
 * Tests for InviteModal Component
 *
 * Tests for inviting users to collaborate on sessions/workflows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteModal } from '../Collaboration/InviteModal';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

// Mock fetch
globalThis.fetch = vi.fn() as any;

describe('InviteModal', () => {
  const mockOnClose = vi.fn();
  const mockOnInviteSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'mock-token' } },
    });
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <InviteModal
        isOpen={false}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render modal when isOpen is true', () => {
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    expect(screen.getByText('Invite Collaborator')).toBeInTheDocument();
    expect(screen.getByText('Test Session')).toBeInTheDocument();
  });

  it('should display resource type and name', () => {
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="workflow"
        resourceId="test-workflow-id"
        resourceName="My Workflow"
      />
    );

    expect(screen.getByText('Inviting to workflow:')).toBeInTheDocument();
    expect(screen.getByText('My Workflow')).toBeInTheDocument();
  });

  it('should have email input field', () => {
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  it('should have role selection dropdown', () => {
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const roleSelect = screen.getByRole('combobox');
    expect(roleSelect).toBeInTheDocument();

    // Check role options
    expect(screen.getByText('Viewer - Can view only')).toBeInTheDocument();
    expect(screen.getByText('Editor - Can view and edit')).toBeInTheDocument();
    expect(screen.getByText('Owner - Full control')).toBeInTheDocument();
  });

  it('should default role to editor', () => {
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const roleSelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(roleSelect.value).toBe('editor');
  });

  it('should update role description when role changes', async () => {
    const user = userEvent.setup();
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const roleSelect = screen.getByRole('combobox');

    // Default should show editor description
    expect(screen.getByText(/Editors can make changes/)).toBeInTheDocument();

    // Change to viewer
    await user.selectOptions(roleSelect, 'viewer');
    expect(screen.getByText(/Viewers can only see the content/)).toBeInTheDocument();

    // Change to owner
    await user.selectOptions(roleSelect, 'owner');
    expect(screen.getByText(/Owners can invite others/)).toBeInTheDocument();
  });

  it('should show error when submitting empty email', async () => {
    const user = userEvent.setup();
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please enter an email address')).toBeInTheDocument();
    });
  });

  it('should call session-invite endpoint for sessions', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'alice@example.com');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('session-invite'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('session_id'),
        })
      );
    });
  });

  it('should call workflow-invite endpoint for workflows', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="workflow"
        resourceId="test-workflow-id"
        resourceName="Test Workflow"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'bob@example.com');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('workflow-invite'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('workflow_id'),
        })
      );
    });
  });

  it('should include selected role in invite request', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'alice@example.com');

    const roleSelect = screen.getByRole('combobox');
    await user.selectOptions(roleSelect, 'viewer');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      const fetchCall = (globalThis.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.role).toBe('viewer');
    });
  });

  it('should show success message after successful invite', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'alice@example.com');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('✓ User invited successfully!')).toBeInTheDocument();
    });
  });

  it('should call onInviteSuccess callback after successful invite', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
        onInviteSuccess={mockOnInviteSuccess}
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'alice@example.com');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('✓ User invited successfully!')).toBeInTheDocument();
    });

    // Fast-forward timer to trigger callback
    vi.advanceTimersByTime(1500);

    await waitFor(() => {
      expect(mockOnInviteSuccess).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });

  it('should show error message on failed invite', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'User not found' }),
    });

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'nonexistent@example.com');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument();
    });
  });

  it('should disable inputs while inviting', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as any).mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 1000))
    );

    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'alice@example.com');

    const submitButton = screen.getByText('Send Invite');
    await user.click(submitButton);

    // Inputs should be disabled during invite
    expect(emailInput).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText('Inviting...')).toBeInTheDocument();
  });

  it('should close modal when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close modal when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should clear form when modal is closed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'alice@example.com');

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    // Reopen modal
    rerender(
      <InviteModal
        isOpen={true}
        onClose={mockOnClose}
        resourceType="session"
        resourceId="test-session-id"
        resourceName="Test Session"
      />
    );

    // Email should be cleared
    expect(screen.getByPlaceholderText('user@example.com')).toHaveValue('');
  });
});
