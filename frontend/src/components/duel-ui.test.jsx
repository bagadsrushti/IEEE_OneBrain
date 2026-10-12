// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const socketMocks = vi.hoisted(() => ({ retryConnection: vi.fn() }));

vi.mock('../config', () => ({
  getPublicUrl: () => 'https://onebrain.example',
  getBackendUrl: () => null,
}));

vi.mock('../SocketContext', () => ({
  useSocket: () => ({
    createRoom: vi.fn(),
    createDuel: vi.fn(),
    joinRoom: vi.fn(),
    checkCode: vi.fn(),
    retryConnection: socketMocks.retryConnection,
    isConnected: false,
    connectionError: 'Server is waking up or unreachable. Retrying...',
    serverWaking: false,
    socket: null,
  }),
}));

import InviteCard from './InviteCard';
import Landing from '../pages/Landing';

describe('Duel and invite UI', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    document.execCommand = vi.fn(() => true);
    socketMocks.retryConnection.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('copies a public invite link and resets the label after two seconds', async () => {
    render(<InviteCard roomCode="ABC123" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Invite Link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://onebrain.example/join/ABC123'));
    expect(screen.getByRole('button', { name: 'Link Copied!' })).toBeTruthy();
    await act(async () => new Promise(resolve => setTimeout(resolve, 2050)));
    expect(screen.getByRole('button', { name: 'Copy Invite Link' })).toBeTruthy();
  });

  it('falls back to execCommand when the clipboard API throws', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    render(<InviteCard roomCode="DUEL42" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Invite Link' }));
    await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith('copy'));
    expect(await screen.findByRole('button', { name: 'Link Copied!' })).toBeTruthy();
  });

  it('shows a selectable public link if both copy methods fail', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    document.execCommand.mockReturnValueOnce(false);
    render(<InviteCard roomCode="DUEL42" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Invite Link' }));
    expect(await screen.findByDisplayValue('https://onebrain.example/join/DUEL42')).toBeTruthy();
  });

  it('shows Retry for a connection error and invokes reconnection', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText('Server is waking up or unreachable. Retrying...')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(socketMocks.retryConnection).toHaveBeenCalledTimes(1);
  });
});
