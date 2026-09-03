import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Candidate } from '../types/election';
import { CandidatePhoto } from './CandidatePhoto';
import { resizeImageToDataUrl } from '../utils/imageResize';

interface CandidateEditorProps {
  candidate: Candidate;
  adminSecret: string;
  onUpdate: (candidateId: string, name: string, imageUrl: string) => Promise<void>;
  onDelete: (candidateId: string) => Promise<void>;
}

export const CandidateEditor = ({ candidate, adminSecret, onUpdate, onDelete }: CandidateEditorProps): JSX.Element => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(candidate.name);
  const [imageUrl, setImageUrl] = useState(candidate.imageUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setPhotoError(undefined);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setImageUrl(dataUrl);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Failed to process photo');
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setIsEditing(false);
      setName(candidate.name);
      setImageUrl(candidate.imageUrl ?? '');
      return;
    }
    if (trimmedName === candidate.name && imageUrl === (candidate.imageUrl ?? '')) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onUpdate(candidate.id, trimmedName, imageUrl);
      setIsEditing(false);
    } catch (error) {
      alert('Failed to update candidate: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setName(candidate.name);
      setImageUrl(candidate.imageUrl ?? '');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(candidate.name);
    setImageUrl(candidate.imageUrl ?? '');
    setPhotoError(undefined);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
          <CandidatePhoto imageUrl={imageUrl || undefined} name={name || candidate.name} size={40} />
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingLeft: 'calc(40px + 0.5rem)' }}>
          <label
            style={{
              padding: '0.35rem 0.6rem',
              backgroundColor: '#eef2ff',
              color: '#3730a3',
              border: '1px solid #c7d2fe',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            📷 {imageUrl ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
          </label>
          {imageUrl && (
            <button
              onClick={() => setImageUrl('')}
              disabled={saving}
              style={{
                padding: '0.35rem 0.6rem',
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Remove photo
            </button>
          )}
          {photoError && <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>{photoError}</span>}
        </div>
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
      <CandidatePhoto imageUrl={candidate.imageUrl} name={candidate.name} size={32} />
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

