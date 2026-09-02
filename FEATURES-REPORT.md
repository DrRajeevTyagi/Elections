# Student Council & House Elections Software - Features Report

## Overview

This is a comprehensive web-based voting system designed for managing student council elections and house-level elections. The software supports both school-wide elections and house-specific elections with separate polling booths and candidate management.

---

## 🏫 School Elections Features

### Election Posts
The software manages elections for **5 school-level posts**:

1. **HB** - Head Boy
2. **HG** - Head Girl
3. **SSC** - School Sports Captain
4. **SRC** - School Resources Captain
5. **SCC** - School Cultural Captain

### School Elections Workflow
- Single activation secret for all polling booths
- All voters cast votes for all 5 posts
- Unified results dashboard
- Candidate management by post

---

## 🏠 House Elections Features

### Election Posts
Each house manages elections for **3 house-level posts**:

1. **HC** - House Captain
2. **HCC** - House Cultural Captain
3. **HSC** - House Sports Captain

### Houses Supported
The system supports **8 houses**:

1. Anand
2. Dhiraj
3. Kripa
4. Prem
5. Namrata
6. Nishtha
7. Satya
8. Shanti

### House Elections Workflow
- **One-time house selection** per polling booth at startup
- House selection persists across all votes at that booth
- Each booth is dedicated to one house
- Separate candidate pools per house and post
- House-wise results display

---

## 🎛️ Admin Dashboard Features

### Election Type Management

#### Election Type Selection
- **Toggle between School and House Elections**
- Only one election type active at a time
- Automatic session clearing when switching types
- Poll closes automatically when switching election types

#### Visual Indicators
- Color-coded buttons showing active election type (green = active, gray = inactive)
- Current election type displayed prominently
- Prevents changing type when poll is open

### Poll Controls

#### Poll Management
- **Open Poll**: Start voting for the active election type
- **Close Poll**: Stop accepting new votes
- **Reset Poll**: Clear all votes (only when poll is closed)
- **Refresh**: Manual refresh of dashboard data

#### Security
- Admin secret required for all poll operations
- Confirmation dialogs for critical actions (reset, type switch)
- Prevents opening poll without election type selected

### Candidate Management

#### School Elections View
- **Post-based organization**: All candidates grouped by post (HB, HG, SSC, SRC, SCC)
- Edit, delete, and add candidates for each post
- Real-time updates after changes

#### House Elections View
- **House-wise organization**: All 8 houses displayed in order
  - Anand House → Dhiraj House → Kripa House → ... → Shanti House
- Within each house, posts displayed vertically:
  - HC (House Captain) - all candidates together
  - HCC (House Cultural Captain) - all candidates together
  - HSC (House Sports Captain) - all candidates together
- Edit, delete, and add candidates per house and post
- Visual house headers with borders and styling

#### Candidate Operations
- **Add Candidate**: 
  - Click "Add Candidate" button for a post
  - Enter candidate name
  - Automatically assigned unique ID
  - Election type and house automatically determined
- **Edit Candidate**: 
  - Edit candidate name inline
  - Admin secret required
- **Delete Candidate**: 
  - Delete candidates with confirmation
  - Admin secret required

### Results Overview

#### School Elections View
- Post-based results display
- Vote counts per candidate
- Results sorted by vote count (highest first)
- Visual highlighting for leading candidates (green background)

#### House Elections View
- **House-wise results organization**:
  - Each house shown in its own section
  - Within each house, posts displayed vertically (HC, HCC, HSC)
  - Vote counts shown per candidate per post
  - Results sorted by vote count within each post

#### Auto-Refresh Feature
- **Automatic polling every 3 seconds** when poll is open
- Real-time vote count updates
- Last updated timestamp displayed
- Auto-refresh stops when poll is closed
- Manual refresh button always available

#### Results Display
- Total votes calculated and displayed
- Leading candidates highlighted in green
- Vote badges showing count (with singular/plural handling)
- Empty state messages when no candidates/votes exist

---

## 🗳️ Kiosk/Voting Features

### School Elections Voting Flow

1. **Welcome Page**
   - Landing page for polling booth
   - Link to officer activation

2. **Activation Page**
   - Polling officer enters secret key (`unlock-me`)
   - Single-use token generated
   - Redirects to voting page

3. **Voting Page**
   - Displays all 5 posts (HB, HG, SSC, SRC, SCC)
   - Candidate selection for each post
   - Validation: Must select one candidate per post
   - Review selections before submission

4. **Confirmation**
   - Vote submitted successfully
   - Vote ID and timestamp displayed
   - Option to reset for next voter

### House Elections Voting Flow

1. **Welcome Page**
   - Checks active election type
   - Redirects to house selection if house elections active

2. **House Selection Page** (One-time per booth)
   - Polling officer selects house from 8 options
   - Grid layout with all houses
   - Selection stored for entire booth session
   - Persists across all votes at that booth
   - Redirects to activation

3. **Activation Page**
   - Shows selected house (if house elections)
   - Polling officer enters secret key
   - House included in activation request
   - Single-use token generated with house information

4. **Voting Page**
   - Displays all 3 posts (HC, HCC, HSC)
   - Candidates filtered by selected house
   - Validation: Must select one candidate per post
   - Review selections before submission

5. **Confirmation**
   - Vote submitted successfully
   - Vote ID and timestamp displayed
   - House information stored with vote
   - Option to reset for next voter (house persists)

### Voting Security Features

- **Single-use tokens**: Each activation creates a unique token
- **Token expiration**: Tokens expire after 10 minutes
- **Consumed tokens**: Tokens are invalidated after vote submission
- **Poll state validation**: Cannot activate if poll is closed
- **Election type validation**: Cannot activate if no election type is active

---

## 🔐 Security Features

### Authentication & Authorization

#### Admin Authentication
- **Admin Secret**: `admin-secret` (configurable via environment)
- Required for:
  - Opening/closing poll
  - Resetting poll
  - Changing election type
  - Managing candidates (add/edit/delete)

#### Kiosk Authentication
- **Kiosk Secret**: `unlock-me` (configurable via environment)
- Required for ballot activation
- Single-use token generation
- Token validation for vote submission

### Data Protection
- **Session management**: Tokens stored in memory with expiration
- **Vote integrity**: Each vote has unique ID and timestamp
- **Poll state protection**: Cannot vote when poll is closed
- **Election type isolation**: Votes tagged with election type

---

## 📊 Data Management

### Data Storage
- **JSON-based storage**: Lightweight file-based database
- **Automatic persistence**: Changes saved immediately
- **Data structure**:
  - Candidates with election type and house information
  - Votes with timestamp and selections
  - Poll state with active election type

### Data Validation
- **Candidate validation**: Post must match election type
- **House validation**: Required for house elections
- **Vote validation**: Must select candidate for all posts
- **Type checking**: Ensures data integrity

---

## 🎨 User Interface Features

### Design Elements
- **Modern, clean interface**: Card-based layout
- **Responsive design**: Works on different screen sizes
- **Color coding**: 
  - Green for active/success states
  - Red for errors/warnings
  - Blue for informational elements
- **Visual hierarchy**: Clear sections and headings

### Navigation
- **Clear routing**: Separate pages for each step
- **Breadcrumb awareness**: Users know where they are
- **Error messages**: Clear, actionable error feedback
- **Loading states**: Visual indicators during operations

### Accessibility
- **Form labels**: All inputs properly labeled
- **Button states**: Disabled states prevent invalid actions
- **Error feedback**: Clear error messages
- **Status indicators**: Visual feedback for all actions

---

## 🔄 Real-Time Features

### Auto-Refresh Dashboard
- **3-second polling interval** when poll is open
- **Automatic updates**: No manual refresh needed
- **Efficient updates**: Only refreshes when poll is open
- **Last updated timestamp**: Shows when data was last refreshed

### Live Results
- **Real-time vote counts**: Updates as votes are cast
- **Leading candidate highlighting**: Visual indication of winners
- **Total vote calculations**: Automatic aggregation

---

## 📱 Operational Features

### Poll Lifecycle Management

#### Opening Poll
1. Select election type (School/House)
2. Configure candidates
3. Enter admin secret
4. Click "Open Poll"
5. Validation: Election type must be selected

#### During Voting
- Auto-refresh active on admin dashboard
- Real-time results updating
- Vote counting and display
- Session management for kiosks

#### Closing Poll
1. Enter admin secret
2. Click "Close Poll"
3. All active sessions cleared
4. Auto-refresh stops
5. No new votes accepted

#### Resetting Poll
1. Close poll first (safety requirement)
2. Enter admin secret
3. Confirm action
4. All votes deleted
5. Results reset to zero

---

## 🔧 Technical Features

### Backend Architecture
- **Node.js + Express**: RESTful API server
- **TypeScript**: Type-safe codebase
- **Modular structure**: Separate routes, services, middleware
- **Error handling**: Comprehensive error middleware
- **CORS enabled**: Network access support

### Frontend Architecture
- **React + TypeScript**: Modern UI framework
- **Vite**: Fast development and build
- **React Router**: Client-side routing
- **Context API**: State management for kiosk
- **Axios**: HTTP client for API calls

### API Endpoints

#### Poll Management
- `GET /api/poll` - Get poll status
- `POST /api/poll/open` - Open poll (requires admin secret)
- `POST /api/poll/close` - Close poll (requires admin secret)
- `POST /api/poll/reset` - Reset poll (requires admin secret)
- `POST /api/poll/set-type` - Set election type (requires admin secret)

#### Kiosk Operations
- `POST /api/kiosk/activate` - Activate ballot (requires secret + house for house elections)
- `POST /api/kiosk/deactivate` - Deactivate session

#### Voting
- `POST /api/votes` - Submit vote (requires kiosk token)

#### Candidates
- `GET /api/posts` - Get posts and candidates (filtered by election type)
- `POST /api/candidates` - Add candidate (requires admin secret)
- `PUT /api/candidates/:id` - Update candidate (requires admin secret)
- `DELETE /api/candidates/:id` - Delete candidate (requires admin secret)

#### Results
- `GET /api/results` - Get results (filtered by election type, optional house filter)

---

## 📝 Configuration

### Environment Variables (Backend)
- `PORT`: Server port (default: 4000)
- `ADMIN_SECRET`: Admin authentication secret (default: `admin-secret`)
- `KIOSK_SECRET`: Kiosk activation secret (default: `unlock-me`)
- `DATA_FILE`: Path to data JSON file (default: `../data/data.json`)

### Network Configuration
- **Backend**: Listens on `0.0.0.0` (accessible from network)
- **Frontend**: Proxy configured for API calls
- **Development**: Backend on port 4000, Frontend on port 5173

---

## 🚀 Deployment Features

### Easy Startup
- **Batch scripts**: `START-SERVERS.bat` for Windows
- **Installer script**: `INSTALL-AND-RUN.bat` for first-time setup
- **Dependency checking**: Verifies Node.js and dependencies
- **Clear instructions**: Helpful messages and guides

### Production Ready
- **Build support**: TypeScript compilation
- **Separate dev/prod modes**: Different configurations
- **Error logging**: Console error tracking
- **Data persistence**: Automatic data saving

---

## 📋 Summary of Key Features

### ✅ Core Capabilities
- Dual election type support (School + House)
- Separate candidate pools per election type
- House-wise organization for house elections
- Real-time results with auto-refresh
- Secure voting with single-use tokens
- Comprehensive admin controls

### ✅ User Experience
- Intuitive interface
- Clear visual feedback
- Error prevention and validation
- Responsive design
- Easy navigation

### ✅ Security & Integrity
- Authentication for admin and kiosk
- Single-use voting tokens
- Poll state validation
- Data integrity checks
- Session management

### ✅ Operational Features
- One-time house selection per booth
- House persistence across votes
- Automatic data persistence
- Real-time dashboard updates
- Comprehensive candidate management

---

## 📊 Feature Comparison: School vs House Elections

| Feature | School Elections | House Elections |
|---------|-----------------|-----------------|
| **Posts** | 5 posts (HB, HG, SSC, SRC, SCC) | 3 posts (HC, HCC, HSC) |
| **Organization** | Post-based | House-based, then post-based |
| **Candidate Pool** | Global (all students) | Per house |
| **Activation** | Direct to activation | House selection first |
| **Voting Flow** | Simple (activate → vote) | Two-step (select house → activate → vote) |
| **Results Display** | Post-wise | House-wise, then post-wise |
| **Booth Dedication** | General purpose | One house per booth |

---

## 🎯 Use Cases Supported

1. **Complete School Elections**
   - Manage all 5 school posts
   - Multiple polling booths
   - Unified results

2. **Complete House Elections**
   - Manage all 8 houses
   - 3 posts per house
   - Dedicated booths per house
   - House-specific results

3. **Sequential Elections**
   - Run school elections first
   - Switch to house elections
   - Independent vote counts
   - Separate candidate pools

4. **Live Monitoring**
   - Real-time dashboard updates
   - Live vote counts
   - Progress tracking

5. **Candidate Management**
   - Add candidates before opening poll
   - Edit candidate names
   - Remove candidates
   - Manage by post (school) or house+post (house)

---

## 🔮 Current Limitations & Notes

1. **One Election at a Time**: Only one election type (school OR house) can be active simultaneously
2. **House Selection**: One house per booth, selected once at startup
3. **Manual Refresh**: Manual refresh button always available in addition to auto-refresh
4. **Data Storage**: Currently uses JSON file storage (can be upgraded to database)
5. **Network Access**: Backend listens on all interfaces for network access

---

## 📞 Quick Reference

### Default Secrets
- **Admin Secret**: `admin-secret`
- **Kiosk Secret**: `unlock-me`

### URLs (Development)
- **Frontend**: `http://localhost:5173`
- **Admin Dashboard**: `http://localhost:5173/admin`
- **Kiosk**: `http://localhost:5173/kiosk`
- **Backend API**: `http://localhost:4000/api`

### Posts
- **School**: HB, HG, SSC, SRC, SCC
- **House**: HC, HCC, HSC

### Houses
Anand, Dhiraj, Kripa, Prem, Namrata, Nishtha, Satya, Shanti

---

*Last Updated: Based on current implementation*
*Software Version: 1.0.0*

