import { useState } from 'react';
import type { PostId, HouseId } from '../types/election';

interface AddCandidateFormProps {
  post: PostId;
  house?: HouseId;
  onAdd: (post: PostId, name: string, house?: HouseId) => Promise<void>;
}

export const AddCandidateForm = ({ post, house, onAdd }: AddCandidateFormProps): JSX.Element => {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    try {
      await onAdd(post, name, house);
      setName('');
      setIsAdding(false);
    } catch (error) {
      alert('Failed to add candidate: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        alignItems: 'center', 
        width: '100%',
        padding: '0.5rem',
        backgroundColor: '#f0f9ff',
        borderRadius: '6px',
        border: '1px dashed #3b82f6'
      }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter candidate name"
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
          {saving ? '...' : '✓ Add'}
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
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      style={{
        width: '100%',
        padding: '0.5rem',
        backgroundColor: 'transparent',
        color: '#3b82f6',
        border: '1px dashed #3b82f6',
        borderRadius: '6px',
        fontSize: '0.85rem',
        cursor: 'pointer',
        fontWeight: 500
      }}
    >
      + Add Candidate
    </button>
  );
};






