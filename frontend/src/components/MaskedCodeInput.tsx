import { useState } from 'react';

interface MaskedCodeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Masks an officer code as it's typed/pasted (like a password field), with
// a tap-to-reveal toggle -- 2026-09-24 trial feedback: the code was fully
// visible on screen while entering it, readable by anyone nearby in a room
// full of people voting together. The toggle keeps the ability to double
// check what was typed/pasted before submitting.
export const MaskedCodeInput = ({ id, value, onChange, placeholder }: MaskedCodeInputProps): JSX.Element => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        name={id}
        type={revealed ? 'text' : 'password'}
        value={value}
        className="form-input"
        autoComplete="off"
        autoCapitalize="none"
        maxLength={6}
        style={{
          textTransform: 'lowercase',
          letterSpacing: '0.15em',
          fontFamily: 'monospace',
          width: '100%',
          paddingRight: '2.75rem'
        }}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-label={revealed ? 'Hide code' : 'Show code'}
        title={revealed ? 'Hide code' : 'Show code'}
        style={{
          position: 'absolute',
          right: '0.4rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.15rem',
          padding: '0.3rem',
          lineHeight: 1
        }}
      >
        {revealed ? '🙈' : '👁️'}
      </button>
    </div>
  );
};
