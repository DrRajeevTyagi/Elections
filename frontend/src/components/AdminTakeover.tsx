import { useEffect, useRef, useState } from 'react';
import {
  cancelAdminTakeover,
  getAdminSessionStatus,
  getAdminTakeoverRequest,
  requestAdminTakeover,
  respondToAdminTakeover
} from '../services/api';
import type { AdminSessionConflictDetails, PendingTakeoverRequest, TakeoverRequestInfo } from '../types/api';

// Handing over the admin console (see backend services/adminSessionService.ts):
// - TakeoverRequestBox: on the login screen of a second device -- asks the
//   device in control for control and waits for its answer.
// - TakeoverPrompt: on the device in control -- checks in every few seconds
//   and pops up Allow / Deny when someone asks.

const REQUEST_CHECK_MS = 2000;
const HOLDER_CHECK_MS = 4000;

const secondsLeft = (deadline: number, now: number): number => Math.max(0, Math.ceil((deadline - now) / 1000));

// Turns the server's expiry into a deadline on this device's own clock, so
// a computer whose clock is a little off still counts down correctly.
const localDeadline = (request: { createdAt: number; expiresAt: number }, receivedAt: number): number =>
  receivedAt + (request.expiresAt - request.createdAt);

const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
};

interface TakeoverRequestBoxProps {
  adminSecret: string;
  message: string;
  details: AdminSessionConflictDetails;
  onGranted: () => void;
  // Nobody is in control any more -- just log in normally.
  onRetryLogin: () => void;
}

type AskPhase = 'idle' | 'asking' | 'waiting' | 'denied' | 'expired' | 'error';

export const TakeoverRequestBox = ({ adminSecret, message, details, onGranted, onRetryLogin }: TakeoverRequestBoxProps): JSX.Element => {
  const [phase, setPhase] = useState<AskPhase>('idle');
  const [request, setRequest] = useState<TakeoverRequestInfo | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(phase === 'waiting');
  const holder = details.holderLabel ?? 'the other device';

  // Keep asking the server for the answer while waiting.
  useEffect(() => {
    if (phase !== 'waiting' || !request) {
      return;
    }
    let stopped = false;
    const check = async () => {
      try {
        const latest = await getAdminTakeoverRequest(adminSecret, request.id);
        if (stopped) {
          return;
        }
        if (latest.status === 'approved') {
          stopped = true;
          onGranted();
        } else if (latest.status === 'denied') {
          setPhase('denied');
        } else if (latest.status === 'expired' || latest.status === 'cancelled') {
          setPhase('expired');
        }
      } catch {
        // A blip -- the next check retries.
      }
    };
    const id = setInterval(() => void check(), REQUEST_CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [phase, request, adminSecret, onGranted]);

  // Leaving the login screen while still waiting withdraws the request, so
  // the other device can't hand control to a screen nobody is looking at.
  const waitingRequestId = useRef<string | null>(null);
  waitingRequestId.current = phase === 'waiting' && request ? request.id : null;
  useEffect(
    () => () => {
      if (waitingRequestId.current) {
        void cancelAdminTakeover(adminSecret, waitingRequestId.current);
      }
    },
    [adminSecret]
  );

  const handleAsk = async () => {
    setPhase('asking');
    setError(null);
    try {
      const created = await requestAdminTakeover(adminSecret);
      setRequest(created);
      setDeadline(localDeadline(created, Date.now()));
      setPhase('waiting');
    } catch (askError) {
      const code = (askError as { errorCode?: string })?.errorCode;
      if (code === 'TAKEOVER_NOT_NEEDED') {
        onRetryLogin();
        return;
      }
      setError(askError instanceof Error ? askError.message : 'Could not send the request');
      setPhase('error');
    }
  };

  const handleCancel = () => {
    if (request) {
      void cancelAdminTakeover(adminSecret, request.id);
    }
    setPhase('idle');
  };

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        backgroundColor: '#fffbeb',
        border: '2px solid #f59e0b',
        borderRadius: '8px',
        color: '#92400e'
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{message}</p>
      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
        Only one device can control the election at a time. You can ask {holder} to hand over control &mdash; they
        will see a message and can allow or refuse.
      </p>

      {phase === 'waiting' && (
        <p style={{ margin: '0.75rem 0 0 0', fontWeight: 600 }} role="status">
          ⏳ Waiting for {holder} to answer&hellip; ({secondsLeft(deadline, now)}s)
        </p>
      )}
      {phase === 'denied' && (
        <p style={{ margin: '0.75rem 0 0 0', fontWeight: 700, color: '#b91c1c' }} role="status">
          ✋ Request refused. {holder} is staying in control.
        </p>
      )}
      {phase === 'expired' && (
        <p style={{ margin: '0.75rem 0 0 0', fontWeight: 600 }} role="status">
          No answer from {holder}. If that device has been switched off, closed or has crashed, you will be able to
          log in normally once it has been silent for 3 minutes &mdash; try again in a few minutes.
        </p>
      )}
      {phase === 'error' && error && <p style={{ margin: '0.75rem 0 0 0', fontWeight: 600, color: '#b91c1c' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        {phase === 'waiting' ? (
          <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={handleCancel}>
            Cancel Request
          </button>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => void handleAsk()}
            disabled={phase === 'asking'}
            style={{ backgroundColor: '#ea580c' }}
          >
            {phase === 'asking' ? 'Sending request...' : phase === 'idle' ? 'Ask for Control' : 'Ask Again'}
          </button>
        )}
        {(phase === 'expired' || phase === 'denied') && (
          <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={onRetryLogin}>
            Try Logging In Again
          </button>
        )}
      </div>
    </div>
  );
};

// A short two-tone alert so the request isn't missed when the admin is
// looking elsewhere. Browsers may block sound -- that's fine, the popup
// and the flashing tab title still show.
const playAlert = (): void => {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = new AudioContextClass();
    [0, 0.25].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = index === 0 ? 880 : 660;
      gain.gain.value = 0.15;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.2);
    });
    setTimeout(() => void context.close().catch(() => undefined), 1000);
  } catch {
    // No sound available -- the popup itself is the main signal.
  }
};

interface TakeoverPromptProps {
  adminSecret: string;
  // Called after this device allowed the request -- it is no longer in
  // control and should go back to the login screen.
  onHandedOver: (newHolderLabel: string) => void;
}

export const TakeoverPrompt = ({ adminSecret, onHandedOver }: TakeoverPromptProps): JSX.Element | null => {
  const [pending, setPending] = useState<PendingTakeoverRequest | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenId = useRef<string | null>(null);
  const now = useNow(Boolean(pending));

  // Checking in every few seconds -- also what tells the server this device
  // is still alive. Losing control mid-way is handled by the api layer's
  // ADMIN_SESSION_LOST handler (see AdminLandingPage).
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const status = await getAdminSessionStatus(adminSecret);
        if (stopped) {
          return;
        }
        const next = status.pendingRequest;
        if (next && next.id !== seenId.current) {
          seenId.current = next.id;
          setDeadline(localDeadline(next, Date.now()));
          setError(null);
          playAlert();
        }
        setPending(next);
      } catch {
        // A blip -- the next check retries.
      }
    };
    void check();
    const id = setInterval(() => void check(), HOLDER_CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [adminSecret]);

  // Flash the browser tab title while a request is waiting, so it's noticed
  // even from another tab.
  useEffect(() => {
    if (!pending) {
      return;
    }
    const original = document.title;
    let flip = false;
    const id = setInterval(() => {
      flip = !flip;
      document.title = flip ? '⚠ Control requested!' : original;
    }, 1000);
    return () => {
      clearInterval(id);
      document.title = original;
    };
  }, [pending]);

  if (!pending || secondsLeft(deadline, now) === 0) {
    return null;
  }

  const requester = pending.label ?? 'Another device';

  const answer = async (allow: boolean) => {
    setAnswering(true);
    setError(null);
    try {
      await respondToAdminTakeover(adminSecret, pending.id, allow);
      setPending(null);
      if (allow) {
        onHandedOver(requester);
      }
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : 'Could not send your answer');
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="takeover-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000
      }}
    >
      <div style={{ backgroundColor: '#ffffff', color: '#111827', borderRadius: '12px', padding: '1.5rem', maxWidth: '440px', width: '100%', border: '3px solid #f59e0b' }}>
        <h2 id="takeover-prompt-title" style={{ marginTop: 0 }}>⚠ Someone wants control</h2>
        <p style={{ overflowWrap: 'anywhere' }}>
          <strong>{requester}</strong> has entered the admin password and is asking to take control of the election.
        </p>
        <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
          <strong>Allow</strong> hands control over and signs this device out. <strong>Deny</strong> keeps you in
          control. No answer in {secondsLeft(deadline, now)}s counts as Deny.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#92400e' }}>
          If you don&apos;t recognise this device, deny it &mdash; someone else knows the admin password.
        </p>
        {error && <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="button" style={{ backgroundColor: '#16a34a' }} disabled={answering} onClick={() => void answer(false)}>
            Deny &mdash; Keep Control
          </button>
          <button className="button" style={{ backgroundColor: '#ea580c' }} disabled={answering} onClick={() => void answer(true)}>
            Allow &mdash; Hand Over
          </button>
        </div>
      </div>
    </div>
  );
};
