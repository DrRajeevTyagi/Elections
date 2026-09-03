const TARGET_SIZE = 160;
const MAX_DATA_URL_LENGTH = 60_000;

const readFileAsImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read that image file'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read that image file'));
    reader.readAsDataURL(file);
  });

/**
 * Center-crops an uploaded image to a square and downscales it to a small
 * JPEG data URL, stepping down quality if needed, so it stays well under
 * the backend's per-candidate size cap (election state is one JSON blob).
 */
export const resizeImageToDataUrl = async (file: File): Promise<string> => {
  const img = await readFileAsImage(file);

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing is not supported in this browser');
  }
  ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

  let quality = 0.7;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.3) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('That photo is too complex to compress small enough. Please try a simpler image.');
  }

  return dataUrl;
};
