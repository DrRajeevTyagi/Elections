interface MaskedCodeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Masks an officer code as it's typed/pasted (like a password field) --
// 2026-09-24 trial feedback: the code was fully visible on screen while
// entering it, readable by anyone nearby in a room full of people voting
// together. There is deliberately no show/hide toggle (removed 2026-10-10
// after the AN branch dry run): officers paste the code from WhatsApp, so
// there is nothing to double check, and a toggle would let a voter at the
// booth reveal the code and use it on their own phone.
export const MaskedCodeInput = ({ id, value, onChange, placeholder }: MaskedCodeInputProps): JSX.Element => (
  <input
    id={id}
    name={id}
    type="password"
    value={value}
    className="form-input"
    autoComplete="off"
    autoCapitalize="none"
    maxLength={6}
    style={{
      textTransform: 'lowercase',
      letterSpacing: '0.15em',
      fontFamily: 'monospace',
      width: '100%'
    }}
    onChange={(event) => onChange(event.target.value.toLowerCase())}
    placeholder={placeholder}
  />
);
