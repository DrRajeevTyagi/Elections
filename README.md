# Student Council Voting System

A kiosk-style voting web app for Mount Carmel School's Student Council elections (School and House elections, across the Dwarka and AN branches), with a password-protected admin dashboard. Runs in production on Google Cloud Run with Firestore storage.

For what the app does, see [FEATURES-REPORT.md](FEATURES-REPORT.md). For running an actual election, see [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md). For a guided test of every feature, see [TESTING-DEMO-SCRIPT.md](TESTING-DEMO-SCRIPT.md).

## Project Structure

- `backend/` – Node.js + Express API (TypeScript). In production it also serves the built frontend.
- `frontend/` – React kiosk and admin dashboard (Vite + TypeScript)
- `Dockerfile` – builds both into one image for Cloud Run
- `.github/workflows/deploy-cloud-run.yml` – type-checks and tests both halves, then deploys, on every push to `main`

## Prerequisites

- Node.js 20 (what CI and the Docker image use)
- npm

## Backend Setup

```bash
cd backend
npm install
npm run dev      # starts the API on http://localhost:4000
```

Environment variables (see `backend/.env.example`):

```
PORT=4000
ADMIN_SECRET=change-me-admin   # always set this -- if missing, the server falls back to a well-known default
USE_FIRESTORE=false            # true in production (Cloud Run)
DATA_FILE=                     # local storage file when USE_FIRESTORE is not true; defaults to backend/data/data.json
STATIC_DIR=                    # folder of the built frontend to serve; set automatically in the Docker image
```

Local development stores everything in one JSON file. The committed `backend/data/data.json` is old sample data for local use only; production never reads it.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev      # Vite dev server, http://localhost:5173
```

The Vite dev server forwards `/api` calls to the backend on port 4000. Change `vite.config.ts` if you run the API on a different port.

- Kiosk (voting booth): http://localhost:5173/kiosk
- Admin dashboard: http://localhost:5173/admin

## Checks Before Pushing

Every push to `main` deploys to the live server, and CI blocks the deploy if any of these fail. Run them locally first:

```bash
cd frontend && npx tsc --noEmit && npm test -- --run && npm run build
cd backend  && npx tsc --noEmit && npm test && npm run build
```

## Student Council Posts

School elections:

- **HB** - Head Boy
- **HG** - Head Girl
- **SSC** - School Sports Captain
- **SRC** - School Resources Captain
- **SCC** - School Cultural Captain

House elections (for each of the 8 houses: Anand, Dhiraj, Kripa, Prem, Namrata, Nishtha, Satya, Shanti):

- **HC** - House Captain
- **HCC** - House Cultural Captain
- **HSC** - House Sports Captain

## Deployment

See [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md). The service must run with `--max-instances=1`: election state is held in memory and saved to Firestore, so a second instance would disagree with the first.
