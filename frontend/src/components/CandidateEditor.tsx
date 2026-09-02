import { useState } from 'react';
import type { Candidate } from '../types/election';

interface CandidateEditorProps {
  candidate: Candidate;
  adminSecret: string;
  onUpdate: (candidateId: string, name: string) => Promise<void>;
  onDelete: (candidateId: string) => Promise<void>;
}

export const CandidateEditor = ({ candidate, adminSecret, onUpdate, onDelete }: CandidateEditorProps): JSX.Element => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(candidate.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === candidate.name) {
      setIsEditing(false);
      setName(candidate.name);
      return;
    }

    setSaving(true);
    try {
      await onUpdate(candidate.id, name.trim());
      setIsEditing(false);
    } catch (error) {
      alert('Failed to update candidate: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setName(candidate.name);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(candidate.name);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            flex: 1,
            padding: '0.5rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.9rem'
          }}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#16a34a',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          {saving ? '...' : '✓'}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${candidate.name}?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      await onDelete(candidate.id);
    } catch (error) {
      alert('Failed to delete candidate: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
      <span style={{ flex: 1 }}>{candidate.name}</span>
      <button
        onClick={() => setIsEditing(true)}
        disabled={saving}
        style={{
          padding: '0.25rem 0.5rem',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.8rem',
          cursor: 'pointer'
        }}
      >
        ✏️ Edit
      </button>
      <button
        onClick={handleDelete}
        disabled={saving}
        style={{
          padding: '0.25rem 0.5rem',
          backgroundColor: '#dc2626',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.8rem',
          cursor: 'pointer'
        }}
      >
        🗑️
      </button>
    </div>
  );
};

