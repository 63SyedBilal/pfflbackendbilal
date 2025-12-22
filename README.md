# PFFL Backend - Phoenix Flag Football League

A comprehensive backend system for managing flag football leagues, teams, players, payments, and notifications.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Setup](#environment-setup)
5. [Database Configuration](#database-configuration)
6. [Payment Integration (Stripe)](#payment-integration-stripe)
7. [Email Configuration (SMTP)](#email-configuration-smtp)
8. [Authentication & Security](#authentication--security)
9. [Project Structure](#project-structure)
10. [API Endpoints](#api-endpoints)
11. [Development Workflow](#development-workflow)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Troubleshooting](#troubleshooting)

---

## Project Overview

This is a Next.js backend application for managing a flag football league system. It includes:

- **User Management**: Players, captains, referees, stat-keepers, and superadmins
- **League Management**: Create and manage leagues with teams
- **Payment Processing**: Stripe integration for league fees
- **Notifications**: Email and in-app notifications
- **Match Management**: Game scheduling and statistics
- **Leaderboard**: Track team and player performance

---

## Prerequisites

- **Node.js** 18+ and npm/pnpm
- **MongoDB** (local or MongoDB Atlas)
- **Stripe Account** (for payments)
- **Email Account** (Gmail, Outlook, or custom SMTP)
- **Cloudinary Account** (for image uploads)

---

## Installation

### Step 1: Clone and Install Dependencies

```bash
# Install dependencies
npm install
# or
pnpm install
```

### Step 2: Create Environment File

Create a `.env.local` file in the project root with all required variables (see [Environment Setup](#environment-setup)).

### Step 3: Start Development Server

```bash
npm run dev
# or
pnpm dev
```

The server will run on `http://localhost:3000` (accessible from network at `0.0.0.0:3000`).

---

## Environment Setup

Create a `.env.local` file in the project root with the following variables:

### Database Configuration

```env
MONGODB_URI=mongodb://localhost:27017/pffl
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pffl?retryWrites=true&w=majority
```

### JWT Configuration

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
```

### Cloudinary Configuration (Image Uploads)

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### SMTP Email Configuration

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@pffl.com
```

### Stripe Payment Configuration

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
```

### Application URL

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**⚠️ Important**: Never commit `.env.local` to version control. It's already in `.gitignore`.

---

## Database Configuration

### MongoDB Setup

1. **Local MongoDB**: Install MongoDB locally and use `mongodb://localhost:27017/pffl`
2. **MongoDB Atlas**: Create a free cluster and use the connection string

### Database Models

The application uses Mongoose schemas located in `modules/`:

- **User**: Main user model with roles (player, captain, referee, stat-keeper, superadmin, free-agent)
- **League**: League information and settings
- **Team**: Team details and members
- **Match**: Game schedules and results
- **Payment**: Payment records and transactions
- **Notification**: User notifications

---

## Payment Integration (Stripe)

### Quick Setup (3 Minutes)

#### Step 1: Get Stripe Keys

1. Go to https://dashboard.stripe.com
2. Sign up or log in
3. Navigate to **Developers** → **API keys**
4. Copy:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_` - click "Reveal")

#### Step 2: Add Keys to `.env.local`

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

#### Step 3: Restart Server

```bash
# Stop server (Ctrl+C)
npm run dev
```

### Payment Flow

```
1. User joins league → Backend creates "unpaid" payment record
2. User clicks "Pay Now" → Payment method selection page
3. User selects Stripe → Payment details page with Stripe Elements
4. User enters card details → Secure Stripe iframe (PCI compliant)
5. Frontend confirms payment → Stripe processes payment
6. Backend verifies → Updates database to "paid"
7. Success page → Payment confirmed
```

### Stripe Elements Implementation

The payment system uses **Stripe Elements** for PCI compliance:

- Card details never reach your server
- Secure iframe hosted by Stripe
- Fully PCI compliant
- Production ready

**API Endpoints:**
- `POST /api/payments/create-intent` - Create Payment Intent
- `POST /api/payments/confirm` - Confirm payment and update database
- `POST /api/payments/stripe` - Legacy endpoint (still works)

### Test Cards

Use these test cards in Stripe test mode:

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | ✅ Successful payment |
| `4000 0000 0000 9995` | ❌ Payment declined |
| `4000 0000 0000 3220` | 🔐 Requires 3D Secure |

**Test Card Details:**
- Expiry: Any future date (e.g., `12/26`)
- CVV: Any 3 digits (e.g., `123`)
- Name: Any name

### Production Setup

1. Complete Stripe account verification
2. Switch to live mode in Stripe Dashboard
3. Get live keys (start with `pk_live_` and `sk_live_`)
4. Update environment variables
5. Enable HTTPS (required by Stripe)

---

## Email Configuration (SMTP)

### Gmail Setup

1. **Enable 2-Step Verification**:
   - Go to https://myaccount.google.com/
   - Navigate to Security → 2-Step Verification

2. **Create App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "PFFL App" and generate
   - Copy the 16-character password

3. **Add to `.env.local`**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # Remove spaces
   ```

### Other Email Providers

**Outlook/Hotmail:**
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

**Yahoo:**
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
```

**Custom SMTP:**
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587  # or 465 for SSL
SMTP_USER=your-username
SMTP_PASS=your-password
```

---

## Authentication & Security

### JWT Authentication

- Access tokens expire in 7 days
- Refresh tokens expire in 30 days
- Tokens stored in localStorage (frontend)

### Password Security

- Passwords hashed with bcrypt
- Minimum strength validation
- Account locking after 5 failed attempts (2-hour lockout)

### Payment Security

- ✅ Card data never logged
- ✅ Payment ownership verification
- ✅ Idempotency protection (prevents double charging)
- ✅ Rate limiting (5 attempts/minute)
- ✅ Enhanced error handling
- ✅ Security audit logging

### API Security

- All endpoints require JWT authentication
- User authorization checks
- Input validation
- Error sanitization

---

## Project Structure

### Overview

This project follows Next.js App Router structure with clear separation between:
- **🔵 Server-Side (Backend)**: API routes, business logic, database models
- **🟢 Client-Side (Frontend)**: React pages, components, UI

### Complete Directory Structure

```
pfflbackendbilal/
│
├── app/                                    # Next.js App Router
│   │
│   ├── 🔵 api/                            # SERVER-SIDE: API Routes (Backend)
│   │   ├── admin/
│   │   │   └── update-user-password/route.ts
│   │   ├── check-users/route.ts
│   │   ├── complete-profile/route.ts
│   │   ├── create-bulk-users/route.ts
│   │   ├── create-test-users/route.ts
│   │   ├── find-user/route.ts
│   │   ├── invite/route.ts
│   │   ├── leaderboard/
│   │   │   └── [leagueId]/route.ts
│   │   ├── league/
│   │   │   ├── [id]/
│   │   │   │   ├── invite/
│   │   │   │   │   ├── referee/route.ts
│   │   │   │   │   ├── statkeeper/route.ts
│   │   │   │   │   └── team/route.ts
│   │   │   │   ├── invite-referee/route.ts
│   │   │   │   ├── invite-statkeeper/route.ts
│   │   │   │   ├── invite-team/route.ts
│   │   │   │   ├── route.ts
│   │   │   │   └── teams/
│   │   │   │       ├── [teamId]/route.ts
│   │   │   │       └── route.ts
│   │   │   └── route.ts
│   │   ├── login/route.ts
│   │   ├── login-test/route.ts
│   │   ├── match/
│   │   │   ├── [id]/
│   │   │   │   ├── action/route.ts
│   │   │   │   ├── fulltime/route.ts
│   │   │   │   ├── halftime/route.ts
│   │   │   │   ├── overtime/route.ts
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── notification/
│   │   │   ├── accept/
│   │   │   │   ├── [notifId]/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── all/route.ts
│   │   │   └── reject/
│   │   │       ├── [notifId]/route.ts
│   │   │       └── route.ts
│   │   ├── payments/
│   │   │   ├── all/route.ts
│   │   │   ├── confirm/route.ts
│   │   │   ├── create-intent/route.ts
│   │   │   ├── my/route.ts
│   │   │   ├── pay/route.ts
│   │   │   ├── process/route.ts
│   │   │   ├── stripe/route.ts
│   │   │   └── unpaid/route.ts
│   │   ├── profile/
│   │   │   ├── [id]/
│   │   │   │   ├── players/[playerId]/
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── seed-games/route.ts
│   │   ├── seed-users/route.ts
│   │   ├── superadmin/
│   │   │   ├── [id]/route.ts
│   │   │   ├── payments/
│   │   │   │   ├── all/route.ts
│   │   │   │   └── unpaid/route.ts
│   │   │   ├── route.ts
│   │   │   └── stats/route.ts
│   │   ├── team/
│   │   │   ├── [id]/
│   │   │   │   ├── players/
│   │   │   │   │   ├── [playerId]/route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── code/[code]/route.ts
│   │   │   ├── invite-player/route.ts
│   │   │   └── route.ts
│   │   ├── test-db/route.ts
│   │   ├── test-login/route.ts
│   │   ├── test-role-mapping/route.ts
│   │   ├── test-update-role/route.ts
│   │   ├── upload/route.ts
│   │   └── user/
│   │       ├── [id]/route.ts
│   │       └── route.ts
│   │
│   ├── 🟢 login/                          # CLIENT-SIDE: Login Page
│   │   └── page.tsx
│   │
│   ├── 🟢 pffl/                          # CLIENT-SIDE: User Dashboard Pages
│   │   ├── games/
│   │   │   ├── [id]/page.tsx            # Game details page
│   │   │   └── page.tsx                  # Games list page
│   │   ├── home/page.tsx                 # User home/dashboard
│   │   ├── leagues/
│   │   │   ├── [id]/page.tsx            # League details page
│   │   │   └── page.tsx                  # Leagues list page
│   │   ├── settings/
│   │   │   ├── notifications/page.tsx    # Notifications page
│   │   │   ├── page.tsx                  # Settings main page
│   │   │   ├── payment/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── details/page.tsx  # Payment details form
│   │   │   │   │   └── page.tsx          # Payment method selection
│   │   │   │   └── success/page.tsx      # Payment success page
│   │   │   ├── payment-history/page.tsx  # Payment history
│   │   │   └── receipt/
│   │   │       └── [id]/page.tsx        # Receipt view
│   │   ├── signup/page.tsx               # User signup page
│   │   ├── stats/page.tsx                # Statistics page
│   │   ├── team/
│   │   │   ├── invite/page.tsx           # Team invitation page
│   │   │   └── page.tsx                  # Team management page
│   │   └── layout.tsx                    # User layout wrapper
│   │
│   ├── 🟢 superadmin/                    # CLIENT-SIDE: Superadmin Dashboard
│   │   ├── home/page.tsx                 # Superadmin home
│   │   ├── leagues/
│   │   │   ├── [id]/page.tsx            # League management
│   │   │   └── page.tsx                  # Leagues list
│   │   ├── settings/
│   │   │   ├── notifications/page.tsx    # Admin notifications
│   │   │   ├── page.tsx                  # Admin settings
│   │   │   ├── payment-history/page.tsx  # All payments
│   │   │   └── receipt/
│   │   │       └── [id]/page.tsx        # Receipt view
│   │   ├── users/page.tsx                # User management
│   │   ├── page.tsx                      # Superadmin root
│   │   └── layout.tsx                    # Superadmin layout wrapper
│   │
│   ├── layout.tsx                         # Root layout (shared)
│   ├── globals.css                        # Global styles
│   └── not-found.tsx                      # 404 page
│
├── 🔵 controller/                        # SERVER-SIDE: Business Logic
│   ├── complete-profile.ts
│   ├── invite.ts
│   ├── leaderboard.ts
│   ├── league-invite.ts
│   ├── league.ts
│   ├── login.ts
│   ├── match.ts
│   ├── notification-handlers.ts
│   ├── notification.ts
│   ├── payment.ts
│   ├── profile.ts
│   ├── superadmin.ts
│   ├── team.ts
│   └── user.ts
│
├── 🟢 components/                        # CLIENT-SIDE: React Components
│   ├── cards/
│   │   ├── game-card.tsx
│   │   ├── invitation-card.tsx
│   │   ├── league-card.tsx
│   │   ├── league-invitation-card.tsx
│   │   ├── notification-card-payment.tsx
│   │   ├── payment-history-card.tsx
│   │   ├── payment-reminder-card.tsx
│   │   ├── receipt-card.tsx
│   │   ├── team-users-card.tsx
│   │   └── userscard.tsx
│   ├── forms/
│   │   ├── create-game-form.tsx
│   │   ├── create-league-form.tsx
│   │   ├── profile-form.tsx
│   │   ├── signup-form.tsx
│   │   └── team-form.tsx
│   ├── game/
│   │   ├── actions-timeline.tsx
│   │   ├── attendance-tab.tsx
│   │   └── select-players-tab.tsx
│   ├── layout/
│   │   ├── bell-notification-button.tsx
│   │   ├── page-header.tsx
│   │   └── settings-list.tsx
│   ├── league/
│   │   ├── leaderboard.tsx
│   │   └── league-actions-list.tsx
│   ├── modals/
│   │   ├── add-game-action-modal.tsx
│   │   └── toss-modal.tsx
│   ├── ui/
│   │   └── loading-spinner.tsx
│   └── index.ts
│
├── 🔵 lib/                               # SERVER-SIDE: Utility Functions
│   ├── auth.ts                           # Password hashing, verification
│   ├── cloudinary.ts                     # Image upload to Cloudinary
│   ├── db.ts                             # MongoDB connection
│   ├── jwt.ts                            # JWT token generation/verification
│   ├── nodemailer.ts                     # Email sending (SMTP)
│   ├── payment-security.ts               # Payment security utilities
│   └── utils.ts                          # General utilities
│
├── 🔵 modules/                           # SERVER-SIDE: Database Models (Mongoose)
│   ├── index.ts
│   ├── leaderboard.ts                    # Leaderboard schema
│   ├── league.ts                         # League schema
│   ├── match.ts                          # Match/Game schema
│   ├── notification.ts                   # Notification schema
│   ├── payment.ts                        # Payment schema
│   ├── profile.ts                        # Profile schema
│   ├── superadmin.ts                     # Superadmin schema
│   ├── team.ts                           # Team schema
│   └── user.ts                           # User schema
│
├── 🔵 scripts/                          # SERVER-SIDE: Utility Scripts
│   └── create-bulk-users.ts             # Bulk user creation script
│
├── public/                               # Static Assets
│   ├── assets/
│   │   └── image/                        # SVG and image files
│   ├── placeholder-logo.png
│   ├── placeholder-logo.svg
│   ├── placeholder-user.jpg
│   └── placeholder.jpg
│
├── styles/
│   └── globals.css                        # Additional global styles
│
├── hooks/                                # React Hooks (if any)
│
├── .env.local                            # Environment variables (not in git)
├── package.json                          # Dependencies
├── tsconfig.json                         # TypeScript configuration
├── next.config.mjs                       # Next.js configuration
└── README.md                             # This file
```

### Key Directories Explained

#### 🔵 Server-Side (Backend)

- **`app/api/`**: All API route handlers (Next.js Route Handlers)
  - Handles HTTP requests (GET, POST, PATCH, DELETE)
  - Contains business logic and database operations
  - Returns JSON responses

- **`controller/`**: Business logic layer
  - Separates API routes from business logic
  - Reusable functions for API routes
  - Handles data validation and processing

- **`lib/`**: Utility functions
  - Authentication helpers (password hashing, JWT)
  - Database connection management
  - Email sending (Nodemailer)
  - Image upload (Cloudinary)
  - Payment security utilities

- **`modules/`**: Database models
  - Mongoose schemas and models
  - Defines data structure and validation
  - Database relationships and references

- **`scripts/`**: Utility scripts
  - One-time setup scripts
  - Data seeding scripts
  - Bulk operations

#### 🟢 Client-Side (Frontend)

- **`app/login/`**: Login page
  - User authentication interface
  - JWT token management

- **`app/pffl/`**: User dashboard pages
  - Home, games, leagues, teams
  - Settings and payment pages
  - User-specific functionality

- **`app/superadmin/`**: Superadmin dashboard
  - Admin-only pages
  - User management
  - League management
  - Payment oversight

- **`components/`**: Reusable React components
  - Cards, forms, modals
  - Layout components
  - UI elements

### Data Flow

```
🟢 Client (Frontend)          🔵 Server (Backend)          🔵 Database
───────────────────          ───────────────────          ────────────
React Pages/Components  →     API Routes (route.ts)  →     MongoDB
     ↓                            ↓
User Interaction         Controller Functions      Mongoose Models
     ↓                            ↓
API Calls (fetch)         Business Logic           Database Queries
     ↓                            ↓
Display Results          Return JSON Response     Data Storage
```

---

## API Endpoints

### Authentication

- `POST /api/login` - User login
- `POST /api/invite` - Send invitation

### User Management

- `GET /api/user` - Get current user
- `GET /api/user/[id]` - Get user by ID
- `GET /api/profile` - Get user profile
- `GET /api/profile/[id]` - Get profile by ID
- `PATCH /api/complete-profile` - Complete user profile

### League Management

- `GET /api/league` - Get all leagues
- `POST /api/league` - Create league
- `GET /api/league/[id]` - Get league by ID
- `PATCH /api/league/[id]` - Update league
- `DELETE /api/league/[id]` - Delete league

### Payment Processing

- `GET /api/payments/my` - Get user's payments
- `GET /api/payments/unpaid` - Get unpaid payments
- `POST /api/payments/create-intent` - Create Stripe Payment Intent
- `POST /api/payments/confirm` - Confirm payment
- `POST /api/payments/stripe` - Process Stripe payment (legacy)

### Team Management

- `GET /api/team` - Get all teams
- `POST /api/team` - Create team
- `GET /api/team/[id]` - Get team by ID
- `PATCH /api/team/[id]` - Update team
- `POST /api/team/invite-player` - Invite player to team

### Match Management

- `GET /api/match` - Get all matches
- `POST /api/match` - Create match
- `GET /api/match/[id]` - Get match by ID
- `PATCH /api/match/[id]` - Update match

### Notifications

- `GET /api/notification/all` - Get all notifications
- `POST /api/notification/accept` - Accept notification
- `POST /api/notification/reject` - Reject notification

### Leaderboard

- `GET /api/leaderboard/[leagueId]` - Get league leaderboard

### Superadmin

- `GET /api/superadmin` - Get superadmin dashboard
- `GET /api/superadmin/stats` - Get statistics
- `GET /api/superadmin/payments` - Get all payments

---

## Development Workflow

### Starting Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Creating Bulk Users (Testing)

Use the bulk user creation endpoint:

```bash
# Via API
curl -X POST http://localhost:3000/api/create-bulk-users

# Or via script
npx tsx scripts/create-bulk-users.ts
```

**Created Users:**
- 10 captains: `captain1@gmail.com` to `captain10@gmail.com`
- 10 referees: `referee1@gmail.com` to `referee10@gmail.com`
- 10 players: `player1@gmail.com` to `player10@gmail.com`
- 10 stat-keepers: `statkeeper1@gmail.com` to `statkeeper10@gmail.com`
- Default password: `123456`

### Git Workflow

**Safe Branch Sync:**

```bash
# 1. Check status
git status

# 2. Stash local changes
git stash push -u -m "WIP: Local changes"

# 3. Fetch remote changes
git fetch origin

# 4. Merge or rebase
git merge origin/your-branch
# OR
git rebase origin/your-branch

# 5. Apply stashed changes
git stash pop

# 6. Resolve conflicts if any
# 7. Commit and push
git add .
git commit -m "Your message"
git push origin your-branch
```

---

## Testing

### Payment Testing

1. **Create a league** (as superadmin)
2. **Invite a user** to the league
3. **User accepts invitation** → Payment record created
4. **User clicks "Pay Now"** in notifications
5. **Select Stripe** as payment method
6. **Enter test card**: `4242 4242 4242 4242`
7. **Submit payment** → Should see success page
8. **Verify in database**: Payment status = "paid"
9. **Check Stripe Dashboard**: Payment should appear

### User Testing

```bash
# Test login
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"captain1@gmail.com","password":"123456"}'
```

### Network Testing

For testing with mobile devices or other machines on the same network:

1. **Find your IP address**:
   ```bash
   # Windows
   ipconfig | findstr IPv4
   
   # Mac/Linux
   ifconfig | grep inet
   ```

2. **Update frontend config** to use network IP: `http://192.168.x.x:3000`

3. **Configure Windows Firewall** (if needed):
   - Allow port 3000 through firewall
   - Or use ADB port forwarding: `adb reverse tcp:3000 tcp:3000`

---

## Deployment

### Production Checklist

- [ ] Switch to production MongoDB (MongoDB Atlas)
- [ ] Use production Stripe keys (`pk_live_`, `sk_live_`)
- [ ] Configure production SMTP server
- [ ] Set secure JWT secrets
- [ ] Enable HTTPS
- [ ] Update `NEXT_PUBLIC_APP_URL` to production URL
- [ ] Set up environment variables on hosting platform
- [ ] Test all payment flows
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Configure webhooks (Stripe, etc.)

### Environment Variables for Production

Set these on your hosting platform (Vercel, AWS, etc.):

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=strong-production-secret
JWT_REFRESH_SECRET=strong-production-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Troubleshooting

### Common Issues

#### "MongoDB connection failed"
- Check `MONGODB_URI` in `.env.local`
- Verify MongoDB is running (local) or connection string is correct (Atlas)
- Restart development server

#### "No API key provided" (Stripe)
- Add Stripe keys to `.env.local`
- Restart development server
- Verify keys start with `pk_test_` and `sk_test_`

#### "SMTP configuration is missing"
- Add SMTP variables to `.env.local`
- For Gmail, use App Password (not regular password)
- Restart development server

#### "Payment failed" or "Card declined"
- Use test card: `4242 4242 4242 4242`
- Check Stripe Dashboard for error details
- Verify Stripe keys are correct

#### "Unauthorized" or "Forbidden"
- Check JWT token in localStorage
- Verify user is logged in
- Check user permissions/role

#### "Stripe Elements not showing"
- Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- Restart development server
- Clear browser cache
- Check browser console for errors

#### Connection timeout (network)
- Ensure both devices on same WiFi
- Check Windows Firewall allows port 3000
- Verify IP address hasn't changed
- Use ADB port forwarding as alternative

### Getting Help

1. Check server logs for detailed error messages
2. Check browser console for frontend errors
3. Verify all environment variables are set
4. Check Stripe Dashboard for payment issues
5. Review MongoDB connection status

---

## Additional Resources

### Documentation Files

- **Library Utilities**: See `lib/README.md` for utility functions
- **Modules**: See `modules/README.md` for database schemas

### External Resources

- **Stripe Documentation**: https://stripe.com/docs
- **Next.js Documentation**: https://nextjs.org/docs
- **MongoDB Documentation**: https://docs.mongodb.com
- **Mongoose Documentation**: https://mongoosejs.com/docs

---

## License

Private project - All rights reserved

---

## Support

For issues or questions:
1. Check this README
2. Review error logs
3. Check external documentation
4. Contact development team

---

**Last Updated**: December 2024  
**Version**: 1.0.0

