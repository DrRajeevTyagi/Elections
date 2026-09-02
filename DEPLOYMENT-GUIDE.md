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

## Security Notes:

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






