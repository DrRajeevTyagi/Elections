import type { KioskSession } from '../services/kioskService.js';

declare global {
  namespace Express {
    interface Locals {
      kioskSession?: KioskSession;
    }
  }
}

export {};
