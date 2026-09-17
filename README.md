# Student Council Voting System

This repository contains a kiosk-style voting web app backed by a RESTful API for managing student council elections.

## Project Structure

- `backend/` – Node.js + Express API (TypeScript)
- `frontend/` – React kiosk and admin dashboard (Vite + TypeScript)
- `data/data.json` – JSON persistence store for votes, candidates, and poll settings

## Prerequisites

- Node.js 18 or newer
- npm 9+ (or another Node package manager)

## Backend Setup

```bash
cd backend
npm install
npm run dev      # starts API on http://localhost:4000
```

Environment variables (optional, defaults shown):

```
PORT=4000
ADMIN_SECRET=admin-secret
DATA_FILE=../data/data.json
```

### Available API Endpoints

- `POST /api/kiosk/activate` – Officer enters `secret` to receive a one-use ballot token
- `POST /api/votes` – Submit ballot selections (`x-kiosk-token` header required)
- `GET /api/posts` – Fetch posts & candidates
- `GET /api/poll` – Retrieve poll state (open/closed)
- `POST /api/poll/open|close` – Toggle poll status (`x-admin-secret` header)
- `GET /api/results` – Aggregated totals per candidate

## Frontend Setup

```bash
cd frontend
npm install
npm run dev      # launches Vite dev server (defaults to http://localhost:5173)
```

The Vite dev server proxies `/api` calls to the backend. Update `vite.config.ts` if you run the API on a different port.

## Testing

- Backend unit tests (Vitest):
  ```bash
  cd backend
  npm run test
  ```
- Frontend unit tests (Vitest + Testing Library):
  ```bash
  cd frontend
  npm run test
  ```

> Note: Tests rely on mocked services. Install dependencies before running.

## Operational Notes

- Each kiosk activation produces a single-use token; submitting a ballot invalidates the session.
- Poll closing clears any outstanding tokens and pauses new activations.
- The JSON datastore is designed for lightweight deployments. Replace with a database by adapting `src/storage/datastore.ts`.

## Student Council Posts

- **HB** - Head Boy
- **HG** - Head Girl
- **SSC** - School Sports Captain
- **SRC** - School Resources Captain
- **SCC** - School Cultural Captain

## Future Enhancements

- Integrate barcode-based voter lookup once the student database is available.
- Harden secrets management (e.g., providing secrets via environment or admin UI forms over HTTPS).
- Add production build scripts / containerization for deployment.
