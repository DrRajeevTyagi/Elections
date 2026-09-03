import type { CSSProperties } from 'react';

interface CandidatePhotoProps {
  imageUrl?: string;
  name: string;
  size?: number;
}

// Neutral, unisex silhouette shown when a candidate has no uploaded photo.
const SilhouetteAvatar = ({ size }: { size: number }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    role="img"
    aria-label="No photo available"
    style={{ display: 'block' }}
  >
    <circle cx="50" cy="50" r="50" fill="#d1d5db" />
    <circle cx="50" cy="40" r="18" fill="#9ca3af" />
    <path d="M50 62c-19 0-34 12-34 27a1 1 0 0 0 1 1h66a1 1 0 0 0 1-1c0-15-15-27-34-27z" fill="#9ca3af" />
  </svg>
);

export const CandidatePhoto = ({ imageUrl, name, size = 48 }: CandidatePhotoProps): JSX.Element => {
  const frameStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    border: '1px solid #d1d5db',
    backgroundColor: '#e5e7eb'
  };

  if (imageUrl) {
    return (
      <div style={frameStyle}>
        <img
          src={imageUrl}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div style={frameStyle}>
      <SilhouetteAvatar size={size} />
    </div>
  );
};
