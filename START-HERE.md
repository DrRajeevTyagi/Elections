# 🗳️ Student Council Voting System - START HERE

## Welcome!

This is a complete voting system for student council elections.

---

## ⚡ Quick Start (3 Steps)

### Step 1: Install Node.js (if not already installed)

**Check if you have Node.js:**
1. Press `Windows + R`
2. Type: `cmd` and press Enter
3. Type: `node --version`
4. If you see a version number → **Skip to Step 2**
5. If you see an error → **Continue below**

**Install Node.js:**
1. Go to: **https://nodejs.org/**
2. Click the big green button (LTS version)
3. Download and run the installer
4. Click "Next" through all steps (use defaults)
5. **Restart your computer**

---

### Step 2: Run the System

**Double-click this file:**
```
INSTALL-AND-RUN.bat
```

**What happens:**
- First time: Installs packages (1-2 minutes)
- Subsequent runs: Starts immediately
- Opens 2 PowerShell windows (DON'T CLOSE THEM)
- Shows "Server listening..." when ready

---

### Step 3: Open in Browser

Open Chrome (or any browser) and go to:
```
http://localhost:5173
```

**That's it! The system is running.**

---

## 🎯 Quick Access

- **Kiosk** (for voting): http://localhost:5173/kiosk
- **Admin Dashboard**: http://localhost:5173/admin

---

## 🔑 Login Information

- **Admin Secret**: `admin-secret`
- **Kiosk Secret**: `unlock-me`

---

## 📖 Need More Help?

Open these files for detailed instructions:
- `USER-GUIDE.md` → Complete user manual
- `DEPLOYMENT-GUIDE.md` → Network/internet sharing
- `README.md` → Technical details

---

## ⚠️ Important Notes

1. **Keep PowerShell windows open** while using the system
2. **Close both windows** to stop the servers
3. **Run INSTALL-AND-RUN.bat again** to restart

---

## 🌐 Sharing on WiFi Network

If you want other computers on your WiFi to access this:

1. Find your IP address:
   - Open Command Prompt
   - Type: `ipconfig`
   - Look for "IPv4 Address" (like 192.168.x.x)

2. Others can access at:
   - `http://YOUR_IP:5173/kiosk`
   - Example: `http://192.168.1.100:5173/kiosk`

3. You may need to allow through Windows Firewall

See `DEPLOYMENT-GUIDE.md` for detailed network setup.

---

## ✅ System Features

- 5 student council posts (HB, HG, SSC, SRC, SCC)
- 3-5 candidates per post
- One-time ballot activation by polling officer
- Review selections before submitting
- Admin dashboard with live results
- Edit/add/delete candidates
- Reset poll functionality
- Secure with secret keys

---

**Everything you need is included. Just install Node.js and double-click INSTALL-AND-RUN.bat!**






