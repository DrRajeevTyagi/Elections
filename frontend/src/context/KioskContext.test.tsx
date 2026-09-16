import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KioskProvider, useKiosk } from './KioskContext';
import type { PostCandidateGroup } from '../types/election';
import type { ReactNode } from 'react';

const mockApi = vi.hoisted(() => ({
  activateKiosk: vi.fn(),
  fetchPosts: vi.fn(),
  submitVote: vi.fn(),
  deactivateKiosk: vi.fn()
}));

vi.mock('../services/api', () => mockApi);

describe('KioskProvider', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <KioskProvider>{children}</KioskProvider>;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('activates and loads posts', async () => {
    const posts: PostCandidateGroup[] = [
      {
        post: 'HB',
        candidates: [
          { id: 'hb-1', name: 'Candidate A', post: 'HB', electionType: 'school' },
          { id: 'hb-2', name: 'Candidate B', post: 'HB', electionType: 'school' }
        ]
      }
    ];

    mockApi.activateKiosk.mockResolvedValue({ token: 'token-123' });
    mockApi.fetchPosts.mockResolvedValue({ posts });

    const { result } = renderHook(() => useKiosk(), { wrapper });

    await act(async () => {
      await result.current.activate('secret');
    });

    expect(result.current.token).toBe('token-123');
    expect(result.current.posts).toHaveLength(1);
    expect(result.current.status).toBe('ready');
  });

  it('submits vote and records confirmation', async () => {
    const posts: PostCandidateGroup[] = [
      {
        post: 'HB',
        candidates: [{ id: 'hb-1', name: 'Candidate A', post: 'HB', electionType: 'school' }]
      }
    ];

    mockApi.activateKiosk.mockResolvedValue({ token: 'token-123' });
    mockApi.fetchPosts.mockResolvedValue({ posts });
    mockApi.submitVote.mockResolvedValue({ voteId: 'vote-1', timestamp: 1700000000000 });

    const { result } = renderHook(() => useKiosk(), { wrapper });

    await act(async () => {
      await result.current.activate('secret');
    });

    await act(async () => {
      result.current.updateSelection('HB', 'hb-1');
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(mockApi.submitVote).toHaveBeenCalledWith('token-123', {
      selections: { HB: 'hb-1' }
    });
    expect(result.current.status).toBe('completed');
    expect(result.current.confirmation?.voteId).toBe('vote-1');
  });
});
