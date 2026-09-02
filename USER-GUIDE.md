# Student Council Voting System - User Guide

## 📦 What You Received

This package contains a complete voting system for student council elections.

---

## 🚀 Quick Start (First Time Setup)

### Step 1: Install Node.js (One-time requirement)

**If Node.js is NOT installed on your computer:**
1. Go to: https://nodejs.org/
2. Download the **LTS version** (recommended)
3. Run the installer (accept all defaults)
4. **Restart your computer**

**To check if Node.js is already installed:**
- Open Command Prompt or PowerShell
- Type: `node --version`
- If you see a version number (like v20.x.x), you're good to go!

### Step 2: Run the System

**Double-click the file:**
```
INSTALL-AND-RUN.bat
```

This will:
- Check if Node.js is installed
- Install all required packages (first time only, takes 1-2 minutes)
- Start both backend and frontend servers
- Open two PowerShell windows

**Wait for both servers to start** (you'll see "Server listening..." messages)

### Step 3: Open the Application

Open your web browser and go to:
```
http://localhost:5173
```

---

## 📱 Using the System

### For Polling Officers (Kiosk):

1. Go to: `http://localhost:5173/kiosk`
2. Click "Officer Activation"
3. Enter secret key: `unlock-me`
4. Voter can now select candidates for 5 posts
5. After all selections, review and submit
6. Screen resets for next voter

### For Administrators:

1. Go to: `http://localhost:5173/admin`
2. Enter admin secret: `admin-secret`
3. **Poll Controls:**
   - Click "Open Poll" to enable voting
   - Click "Close Poll" to stop voting
   - Click "Reset Poll" to clear all votes (poll must be closed first)
4. **Manage Candidates:**
   - Edit candidate names (click ✏️ Edit)
   - Delete candidates (click 🗑️)
   - Add new candidates (click + Add Candidate)
5. **View Results:**
   - Live vote counts for each candidate
   - Click "Refresh" to update
   - Leading candidate highlighted in green

---

## 🔐 Default Secrets

- **Admin Secret**: `admin-secret`
- **Kiosk Secret**: `unlock-me`

⚠️ **For real elections, change these secrets!**

To change secrets:
1. Create a file named `.env` in the `backend` folder
2. Add these lines:
   ```
   ADMIN_SECRET=your-new-admin-password
   KIOSK_SECRET=your-new-kiosk-password
   ```
3. Restart the servers

---

## 🌐 Sharing on Local Network (Same WiFi)

### To let other computers on your WiFi access the system:

**Step 1: Find your IP address**
- Open Command Prompt
- Type: `ipconfig`
- Look for "IPv4 Address" (usually starts with 192.168.x.x)

**Step 2: Share the URLs**
Replace `YOUR_IP` with your actual IP address:
- Kiosk: `http://YOUR_IP:5173/kiosk`
- Admin: `http://YOUR_IP:5173/admin`

**Example:**
If your IP is `192.168.1.100`, share:
- `http://192.168.1.100:5173/kiosk`
- `http://192.168.1.100:5173/admin`

**Step 3: Allow firewall access**
If others can't connect:
1. Open Windows Firewall settings
2. Allow Node.js through the firewall
3. Or disable Windows Firewall temporarily (not recommended for production)

---

## 🛑 How to Stop the System

**Method 1: Close the PowerShell windows**
- Simply close both PowerShell windows that opened

**Method 2: Use Ctrl+C**
- Press Ctrl+C in each PowerShell window
- Type 'Y' to confirm

---

## 📋 Voting Workflow

1. **Admin opens the poll** (Admin Dashboard → Open Poll)
2. **Polling officer activates kiosk** for each voter
3. **Voter selects candidates** for all 5 posts:
   - HB - Head Boy
   - HG - Head Girl
   - SSC - School Sports Captain
   - SRC - School Resources Captain
   - SCC - School Cultural Captain
4. **Voter reviews selections** (green highlighted boxes)
5. **Voter submits ballot**
6. **Screen resets** for next voter
7. **Admin can view live results** (click Refresh)
8. **Admin closes poll** when voting ends
9. **Admin views final results**

---

## 🔧 Troubleshooting

### "This site can't be reached"
- Wait 15 seconds for servers to start
- Check that both PowerShell windows are running
- Try `http://127.0.0.1:5173` instead of localhost

### "Node.js is not installed" error
- Install Node.js from https://nodejs.org/
- Restart your computer
- Run INSTALL-AND-RUN.bat again

### Firewall blocking network access
- Allow Node.js through Windows Firewall
- Or run as Administrator

### Need to reset everything
- Admin Dashboard → Close Poll → Reset Poll
- Restart the servers

---

## 📂 Package Contents

```
voting-system/
├── INSTALL-AND-RUN.bat     ← Double-click this to start
├── START-SERVERS.bat        ← Use this for subsequent runs
├── USER-GUIDE.md           ← This file
├── DEPLOYMENT-GUIDE.md     ← Advanced deployment options
├── README.md               ← Technical documentation
├── backend/                ← Node.js API server
├── frontend/               ← React web interface
└── data/                   ← Vote storage (JSON files)
```

---

## 🎯 Quick Reference Card

**To Start:** Double-click `INSTALL-AND-RUN.bat`  
**To Stop:** Close PowerShell windows  
**Kiosk URL:** http://localhost:5173/kiosk  
**Admin URL:** http://localhost:5173/admin  
**Admin Secret:** admin-secret  
**Kiosk Secret:** unlock-me  

---

## ✅ System Ready!

The system is fully configured and ready to use.

For technical details, see `README.md`  
For deployment options, see `DEPLOYMENT-GUIDE.md`

**Questions or issues?** Check the troubleshooting section above.






