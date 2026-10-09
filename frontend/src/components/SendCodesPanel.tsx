import { useMemo, useState } from 'react';
import { markOfficerCodesSent, updateOfficerCode } from '../services/api';
import {
  buildGroupMessage,
  buildWhatsAppLink,
  dutyLabel,
  groupCodesForSending,
  normalizeIndianPhone,
  DEFAULT_MESSAGE_TEMPLATE
} from '../utils/bulkAllot';
import type { SendGroup, WhatsAppMode } from '../utils/bulkAllot';
import type { Branch } from '../types/election';
import type { OfficerCode } from '../types/api';

// "Send Codes on WhatsApp" (Officer Codes tab). Works from the saved code
// list, not from an upload, so codes can be sent any time -- e.g. the
// evening before -- and sending resumes where it stopped: every message
// opened is marked as sent on the server.
//
// One message per teacher: a teacher with School and House duty gets both
// codes together (see utils/bulkAllot.ts groupCodesForSending).

interface SendCodesPanelProps {
  adminSecret: string;
  branch: Branch;
  officerCodes: OfficerCode[];
  onClose: () => void;
  // Reloads the officer code list after a change, so the ticks shown here
  // come from the server.
  onChanged: () => Promise<void>;
}

type DutyFilter = 'all' | 'school' | 'house';

const MODE_KEY = 'sendCodes.whatsappMode';
const TEMPLATE_KEY = 'sendCodes.messageTemplate';

// Per-browser conveniences only -- storage can be unavailable (private
// window, blocked site data), so every access is guarded.
const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not worth surfacing -- the setting just won't be remembered.
  }
};

const formatSentTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const SendCodesPanel = ({ adminSecret, branch, officerCodes, onClose, onChanged }: SendCodesPanelProps): JSX.Element => {
  const [mode, setMode] = useState<WhatsAppMode>(() => (readStored(MODE_KEY) === 'web' ? 'web' : 'app'));
  const [template, setTemplate] = useState(() => readStored(TEMPLATE_KEY) ?? DEFAULT_MESSAGE_TEMPLATE);
  const [dutyFilter, setDutyFilter] = useState<DutyFilter>('all');
  const [unsentOnly, setUnsentOnly] = useState(false);
  // Marks applied on screen straight away, before the server confirms --
  // `null` means "undone". Dropped once the reloaded list reflects them.
  const [pendingMarks, setPendingMarks] = useState<Record<string, number | null>>({});
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchName = branch === 'AN' ? 'AN' : 'Dwarka';

  const groups = useMemo(() => {
    const codes = officerCodes
      .filter((entry) => (entry.branch ?? 'dwarka') === branch)
      // A re-polled booth's code no longer works -- never send it.
      .filter((entry) => !entry.repoll)
      .filter((entry) => {
        const isHouse = entry.electionType === 'house' || Boolean(entry.house);
        return dutyFilter === 'all' || (dutyFilter === 'house') === isHouse;
      })
      .map((entry) => {
        const mark = pendingMarks[entry.code];
        return mark === undefined ? entry : { ...entry, sentAt: mark ?? undefined };
      });
    return groupCodesForSending(codes);
  }, [officerCodes, branch, dutyFilter, pendingMarks]);

  const withPhone = groups.filter((group) => group.phone);
  const withoutPhone = groups.filter((group) => !group.phone);
  const unsent = withPhone.filter((group) => group.pending.length > 0);
  const nextGroup = unsent[0];
  const shownGroups = unsentOnly ? unsent : withPhone;

  const handleModeChange = (next: WhatsAppMode) => {
    setMode(next);
    writeStored(MODE_KEY, next);
  };

  const handleTemplateChange = (next: string) => {
    setTemplate(next);
    writeStored(TEMPLATE_KEY, next);
  };

  const applyMarks = async (codes: string[], sent: boolean) => {
    const value = sent ? Date.now() : null;
    setPendingMarks((prev) => ({ ...prev, ...Object.fromEntries(codes.map((code) => [code, value])) }));
    const clearMarks = () =>
      setPendingMarks((prev) => {
        const next = { ...prev };
        for (const code of codes) {
          delete next[code];
        }
        return next;
      });
    try {
      await markOfficerCodesSent(codes, sent, adminSecret);
      await onChanged();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Could not save the sent mark -- check the connection');
    } finally {
      clearMarks();
    }
  };

  const handleSend = (group: SendGroup) => {
    if (!group.phone) {
      return;
    }
    setError(null);
    const codes = group.pending.length > 0 ? group.pending : group.codes;
    const message = buildGroupMessage(template, codes, group.officerName, branchName);
    const link = buildWhatsAppLink(group.phone, message, mode);
    if (mode === 'app') {
      // A whatsapp:// link hands off to the installed app and leaves this
      // page where it is.
      window.location.href = link;
    } else {
      // A named window is reused for every message instead of opening a
      // fresh tab each time.
      window.open(link, 'whatsapp-send');
    }
    void applyMarks(codes.map((entry) => entry.code), true);
  };

  const handleUndo = (group: SendGroup) => {
    setError(null);
    const sentCodes = group.codes.filter((entry) => entry.sentAt).map((entry) => entry.code);
    if (sentCodes.length > 0) {
      void applyMarks(sentCodes, false);
    }
  };

  const handleSavePhone = async (group: SendGroup) => {
    const phone = normalizeIndianPhone(phoneDrafts[group.key]);
    if (!phone) {
      setError(`"${phoneDrafts[group.key] ?? ''}" doesn't look like a valid 10-digit mobile number`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      for (const entry of group.codes) {
        await updateOfficerCode(entry.code, { phone }, adminSecret);
      }
      await onChanged();
      setPhoneDrafts((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the number');
    } finally {
      setBusy(false);
    }
  };

  const renderCodes = (group: SendGroup) =>
    group.codes.map((entry) => (
      <div key={entry.code}>
        {dutyLabel(entry)}: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{entry.code}</span>
        {group.lastSentAt && !entry.sentAt && <span style={{ color: '#b45309', fontWeight: 600 }}> (new)</span>}
      </div>
    ));

  return (
    <div style={{ padding: '1.25rem', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #16a34a', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>📲 Send Codes on WhatsApp -- {branchName}</h3>
        <button type="button" className="button" style={{ backgroundColor: '#6b7280' }} onClick={onClose}>
          Close
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: '0.75rem' }}>{error}</p>}

      <p style={{ margin: '0 0 0.75rem 0' }}>
        <strong>{withPhone.length - unsent.length} of {withPhone.length}</strong> teacher{withPhone.length === 1 ? '' : 's'} sent.
        {withoutPhone.length > 0 && (
          <span style={{ color: '#92400e', fontWeight: 600 }}>
            {' '}
            {withoutPhone.length} without a WhatsApp number (see bottom).
          </span>
        )}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <button
          className="button"
          style={{ backgroundColor: '#16a34a', fontSize: '1.05rem', opacity: nextGroup ? 1 : 0.5 }}
          disabled={!nextGroup}
          onClick={() => nextGroup && handleSend(nextGroup)}
          title={nextGroup ? `Opens WhatsApp with the message for ${nextGroup.officerName}` : 'Everyone has been sent their code'}
        >
          {nextGroup ? `▶ Send Next: ${nextGroup.officerName} (${unsent.length} left)` : '✓ All sent'}
        </button>
        <div>
          <label className="form-label" htmlFor="send-codes-mode">Open messages in</label>
          <select
            id="send-codes-mode"
            className="form-input"
            value={mode}
            onChange={(event) => handleModeChange(event.target.value as WhatsAppMode)}
          >
            <option value="app">WhatsApp app on this computer</option>
            <option value="web">WhatsApp Web (browser)</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="send-codes-duty">Which codes</label>
          <select
            id="send-codes-duty"
            className="form-input"
            value={dutyFilter}
            onChange={(event) => setDutyFilter(event.target.value as DutyFilter)}
          >
            <option value="all">All codes</option>
            <option value="school">School codes only</option>
            <option value="house">House codes only</option>
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: '0.5rem' }}>
          <input type="checkbox" checked={unsentOnly} onChange={(event) => setUnsentOnly(event.target.checked)} />
          Not sent yet only
        </label>
      </div>

      <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0 0 1rem 0' }}>
        Each click opens WhatsApp with the message ready -- press <strong>Enter</strong> in WhatsApp to send it,
        then come back here for the next one. A message is ticked as sent as soon as WhatsApp opens; if you
        didn&apos;t actually send it, click <strong>Undo</strong>.
        {mode === 'app' && (
          <> The first time, the browser asks to open WhatsApp &mdash; tick &ldquo;Always allow&rdquo;. If nothing
          opens at all, switch to WhatsApp Web above.</>
        )}
      </p>

      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Edit message</summary>
        <textarea
          id="send-codes-template"
          aria-label="Message template"
          className="form-input"
          style={{ width: '100%', minHeight: '140px', fontFamily: 'inherit', marginTop: '0.5rem' }}
          value={template}
          onChange={(event) => handleTemplateChange(event.target.value)}
        />
        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
          {'{name}'} = teacher&apos;s name, {'{codes}'} = their code(s), one per line, {'{branch}'} = {branchName}.{' '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            onClick={() => handleTemplateChange(DEFAULT_MESSAGE_TEMPLATE)}
          >
            Reset to the standard message
          </button>
        </p>
      </details>

      {withPhone.length === 0 ? (
        <p>No named codes with a WhatsApp number for {branchName} yet. Use Upload Teacher List (step 1) to load the teacher list.</p>
      ) : (
        <div style={{ maxHeight: '480px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #bbf7d0' }}>
                <th style={{ padding: '0.4rem' }}>Teacher</th>
                <th style={{ padding: '0.4rem' }}>Code(s)</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
                <th style={{ padding: '0.4rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {shownGroups.map((group) => {
                const isSent = group.pending.length === 0;
                const isNext = nextGroup?.key === group.key;
                return (
                  <tr
                    key={group.key}
                    style={{ borderBottom: '1px solid #dcfce7', backgroundColor: isNext ? '#fef9c3' : undefined }}
                  >
                    <td style={{ padding: '0.4rem' }}>
                      <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{group.officerName}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>+{group.phone}</div>
                    </td>
                    <td style={{ padding: '0.4rem', fontSize: '0.9rem' }}>{renderCodes(group)}</td>
                    <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>
                      {isSent ? (
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Sent {group.lastSentAt ? formatSentTime(group.lastSentAt) : ''}</span>
                      ) : (
                        <span style={{ color: '#b45309', fontWeight: 600 }}>Not sent</span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          className="button"
                          style={{ backgroundColor: isSent ? '#6b7280' : '#16a34a' }}
                          onClick={() => handleSend(group)}
                        >
                          {isSent ? 'Send again' : 'Send'}
                        </button>
                        {group.lastSentAt && (
                          <button className="button" style={{ backgroundColor: '#9ca3af' }} onClick={() => handleUndo(group)}>
                            Undo
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shownGroups.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                    ✓ Everyone in this list has been sent their code.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {withoutPhone.length > 0 && (
        <div style={{ marginTop: '1.25rem', padding: '0.75rem', backgroundColor: '#fffbeb', borderRadius: '6px', border: '1px solid #fcd34d' }}>
          <strong>No WhatsApp number ({withoutPhone.length})</strong>
          <p style={{ fontSize: '0.85rem', color: '#92400e', margin: '0.25rem 0 0.75rem 0' }}>
            Type a 10-digit mobile number and Save to add them to the list above &mdash; or hand them a printed slip
            (Print Code List, step 1).
          </p>
          {withoutPhone.map((group) => (
            <div key={group.key} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ minWidth: '180px', flex: '1 1 180px' }}>
                <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{group.officerName}</div>
                <div style={{ fontSize: '0.85rem' }}>{renderCodes(group)}</div>
              </div>
              <input
                className="form-input"
                style={{ margin: 0, width: '160px' }}
                inputMode="tel"
                placeholder="Mobile number"
                aria-label={`Mobile number for ${group.officerName}`}
                value={phoneDrafts[group.key] ?? ''}
                onChange={(event) => setPhoneDrafts((prev) => ({ ...prev, [group.key]: event.target.value }))}
              />
              <button
                className="button"
                style={{ backgroundColor: '#6b7280', opacity: busy || !phoneDrafts[group.key] ? 0.5 : 1 }}
                disabled={busy || !phoneDrafts[group.key]}
                onClick={() => void handleSavePhone(group)}
              >
                Save
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
