import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const defaultDataFileUrl = new URL('../../data/data.json', import.meta.url);

export const env = {
  port: parseNumber(process.env.PORT, 4000),
  adminSecret: process.env.ADMIN_SECRET ?? 'admin-secret',
  kioskSecret: process.env.KIOSK_SECRET ?? 'unlock-me',
  dataFile: process.env.DATA_FILE ?? fileURLToPath(defaultDataFileUrl),
  useFirestore: process.env.USE_FIRESTORE === 'true',
  staticDir: process.env.STATIC_DIR ?? null
};
