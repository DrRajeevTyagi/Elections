# Deployment Guide - Student Council Voting System

## Option 1: Local Network Access (Same WiFi) ✅ RECOMMENDED FOR TESTING

### Setup Steps:

1. **Restart both servers** (to apply network access changes)
   - Stop both PowerShell windows (Ctrl+C)
   - Restart using `START-SERVERS.bat` or manually

2. **Allow through Windows Firewall**
   - Windows will show a security alert when servers start
   - Click "Allow access" for both Node.js processes
   - If no alert appears, manually add firewall rules (see below)

3. **Share your IP address**
   - Your local IP: `192.168.9.102`
   - Share these URLs with people on your WiFi:
     - Kiosk: `http://192.168.9.102:5173/kiosk`
     - Admin: `http://192.168.9.102:5173/admin`

### Add Firewall Rules (if needed):

```powershell
# Run PowerShell as Administrator
New-NetFirewallRule -DisplayName "Voting Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Voting Frontend" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
```

---

## Option 2: Internet Access via ngrok (Different Locations)

### What is ngrok?
A service that creates a secure tunnel to your localhost, giving you a public URL.

### Steps:

1. **Download ngrok**
   - Go to: https://ngrok.com/download
   - Sign up for a free account
   - Download and extract ngrok.exe

2. **Authenticate ngrok**
   ```powershell
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

3. **Start your servers** (backend and frontend as usual)

4. **Create tunnel for frontend**
   ```powershell
   ngrok http 5173
   ```
   
5. **Share the ngrok URL**
   - ngrok will show a URL like: `https://abc123.ngrok.io`
   - Share this with your team
   - They access: `https://abc123.ngrok.io/admin` or `https://abc123.ngrok.io/kiosk`

### Notes:
- Free ngrok sessions expire after 2 hours
- The URL changes each time you restart ngrok
- Backend must also be running on localhost:4000

---

## Option 3: Cloud Deployment (For Production)

### Recommended Services:

**Backend + Frontend:**
- **Railway.app** (easiest) - Free tier available
- **Render.com** - Free tier with auto-deploy
- **Heroku** - Simple deployment
- **Vercel** (frontend) + Railway (backend)

### Quick Railway Deployment:

1. Create account at https://railway.app
2. Install Railway CLI:
   ```powershell
   npm install -g @railway/cli
   ```

3. Login and deploy:
   ```bash
   railway login
   cd backend
   railway init
   railway up
   ```

4. Get the deployed URL and update frontend API calls

---

## Option 4: VPN Solution (Secure Remote Access)

Use tools like:
- **Tailscale** (easiest) - Free, secure VPN
- **ZeroTier** - Create a virtual network
- **Hamachi** - Traditional VPN

---

## Recommended Approach for Your Use Case:

### For Same WiFi (Other Branch Nearby):
✅ **Use Option 1** - Local Network Access
- Fastest and most reliable
- No third-party services needed
- Just restart servers and share your IP

### For Remote Branch (Different Location):
✅ **Use Option 2** - ngrok
- Quick setup (5 minutes)
- Secure HTTPS connection
- Free for testing

### For Production (Real Election):
✅ **Use Option 3** - Cloud deployment
- Always accessible
- Professional setup
- Persistent data storage

---

## Option 5: Google Cloud Run + Firestore (Production, Recommended)

The repo now ships with a `Dockerfile` (builds frontend + backend into one image,
served by Express) and a Firestore-backed data store, gated by `USE_FIRESTORE=true`.
Because election state is kept in memory and mirrored to Firestore, **the Cloud Run
service must run with `--max-instances=1`** so two instances never diverge.

### One-time GCP setup

```bash
gcloud auth login
gcloud projects create YOUR_PROJECT_ID   # or use an existing project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com firestore.googleapis.com

# Create a Native-mode Firestore database (pick a region near you, e.g. asia-south1)
gcloud firestore databases create --location=asia-south1

# Create an Artifact Registry repo for the container image
gcloud artifacts repositories create school-election \
  --repository-format=docker --location=asia-south1
```

### Manual deploy (from your machine, no GitHub Actions needed)

```bash
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/school-election/school-election:latest

gcloud run deploy school-election \
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/school-election/school-election:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances=1 \
  --set-env-vars USE_FIRESTORE=true,ADMIN_SECRET=your-strong-admin-password,KIOSK_SECRET=your-strong-kiosk-password
```

Cloud Run automatically grants the default compute service account Firestore
access within the same project, and injects `PORT` for you (the app already
listens on `process.env.PORT`).

### Automated deploy via GitHub Actions

`.github/workflows/deploy-cloud-run.yml` deploys on every push to `main`. It needs
these repository secrets (Settings → Secrets and variables → Actions):

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` – from a Workload Identity Federation pool (no
  long-lived JSON keys needed):
  ```bash
  gcloud iam service-accounts create gh-deployer
  gcloud iam workload-identity-pools create github-pool --location=global
  gcloud iam workload-identity-pools providers create-oidc github-provider \
    --location=global --workload-identity-pool=github-pool \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition="assertion.repository=='DrRajeevTyagi/Elections'"
  gcloud iam service-accounts add-iam-policy-binding \
    gh-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/DrRajeevTyagi/Elections"
  ```
- `GCP_SERVICE_ACCOUNT` – `gh-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com`,
  granted `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser`,
  `roles/cloudbuild.builds.editor`, `roles/storage.admin`, and `roles/viewer`
  (the last one is required for `gcloud builds submit` to stream build logs)
  on the project.

### This project's live deployment (for reference)

- GCP project: `school-election-rt2026` (region `asia-south1`)
- Cloud Run service: `school-election`
- Live URL: https://school-election-584391847327.asia-south1.run.app
- GitHub repo: https://github.com/DrRajeevTyagi/Elections — pushing to `main`
  automatically rebuilds and redeploys via `.github/workflows/deploy-cloud-run.yml`.

### Ongoing operational notes

- Rotate `ADMIN_SECRET` / `KIOSK_SECRET` away from the defaults before going live —
  set them as Cloud Run environment variables (or migrate to Secret Manager).
- Firestore document `school-election/state` holds the entire dataset; back it up
  via Firestore's export tools before a live election.
- Local development is unaffected — leave `USE_FIRESTORE` unset to keep using the
  `backend/data/data.json` file as before.

---


⚠️ **Before sharing externally:**
1. Change default secrets in backend `.env` file:
   ```
   ADMIN_SECRET=your-strong-admin-password
   KIOSK_SECRET=your-strong-kiosk-password
   ```

2. Consider using HTTPS (ngrok provides this automatically)

3. For production, use a real database instead of JSON file

---

## Next Steps:

**For testing with your other branch NOW:**

1. Restart both servers (they'll now accept network connections)
2. Check Windows Firewall allows Node.js
3. Share `http://192.168.9.102:5173` with your colleagues
4. They should be able to access the kiosk and admin dashboard

Let me know which option you'd like to pursue!






