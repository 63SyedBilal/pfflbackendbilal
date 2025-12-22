# PFFL Backend API Endpoints

Complete list of all API endpoints for Flutter frontend integration.

**Base URL**: `http://localhost:3000/api` (Development)  
**Production**: `https://your-domain.com/api`

All endpoints support CORS and require `Authorization: Bearer <token>` header for protected routes.

---

## 🔐 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/login` | User login (returns JWT token) |
| `POST` | `/api/login-test` | Test login endpoint |
| `GET` | `/api/login-test` | Get login test data |

---

## 👤 User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user` | Get all users |
| `POST` | `/api/user` | Create new user |
| `GET` | `/api/user/[id]` | Get user by ID |
| `PUT` | `/api/user/[id]` | Update user |
| `DELETE` | `/api/user/[id]` | Delete user |
| `POST` | `/api/find-user` | Find user by email/phone |
| `GET` | `/api/check-users` | Check users existence |
| `POST` | `/api/create-bulk-users` | Create bulk test users |
| `POST` | `/api/create-test-users` | Create test users |
| `POST` | `/api/seed-users` | Seed users in database |
| `POST` | `/api/admin/update-user-password` | Admin: Update user password |

---

## 📋 Profile Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/profile` | Get all profiles |
| `POST` | `/api/profile` | Create profile |
| `GET` | `/api/profile/[id]` | Get profile by ID |
| `PUT` | `/api/profile/[id]` | Update profile |
| `DELETE` | `/api/profile/[id]` | Delete profile |
| `PUT` | `/api/complete-profile` | Complete user profile |

---

## 🏆 League Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/league` | Get all leagues |
| `POST` | `/api/league` | Create new league |
| `GET` | `/api/league/[id]` | Get league by ID |
| `PUT` | `/api/league/[id]` | Update league |
| `DELETE` | `/api/league/[id]` | Delete league |
| `GET` | `/api/league/[id]/teams` | Get all teams in league |
| `POST` | `/api/league/[id]/teams` | Add team to league |
| `DELETE` | `/api/league/[id]/teams/[teamId]` | Remove team from league |
| `POST` | `/api/league/[id]/invite-team` | Invite team to league |
| `POST` | `/api/league/[id]/invite/team` | Invite team (alternative) |
| `POST` | `/api/league/[id]/invite-referee` | Invite referee to league |
| `POST` | `/api/league/[id]/invite/referee` | Invite referee (alternative) |
| `POST` | `/api/league/[id]/invite-statkeeper` | Invite stat keeper to league |
| `POST` | `/api/league/[id]/invite/statkeeper` | Invite stat keeper (alternative) |

---

## 👥 Team Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/team` | Get all teams |
| `POST` | `/api/team` | Create new team |
| `GET` | `/api/team/[id]` | Get team by ID |
| `PUT` | `/api/team/[id]` | Update team |
| `DELETE` | `/api/team/[id]` | Delete team |
| `GET` | `/api/team/code/[code]` | Get team by code |
| `POST` | `/api/team/invite-player` | Invite player to team |
| `GET` | `/api/team/[id]/players` | Get all players in team |
| `POST` | `/api/team/[id]/players` | Add player to team |
| `DELETE` | `/api/team/[id]/players/[playerId]` | Remove player from team |

---

## ⚽ Match Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/match` | Get all matches |
| `POST` | `/api/match` | Create new match |
| `GET` | `/api/match/[id]` | Get match by ID |
| `PUT` | `/api/match/[id]` | Update match |
| `POST` | `/api/match/[id]/action` | Add action to match |
| `POST` | `/api/match/[id]/halftime` | Mark halftime |
| `POST` | `/api/match/[id]/fulltime` | Mark fulltime |
| `POST` | `/api/match/[id]/overtime` | Mark overtime |
| `POST` | `/api/seed-games` | Seed games in database |

---

## 💰 Payment Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/payments/my` | Get user's payments (query: `?leagueId=xxx`) |
| `GET` | `/api/payments/unpaid` | Get all unpaid payments for user |
| `GET` | `/api/payments/all` | Get all payments |
| `POST` | `/api/payments/create-intent` | Create Stripe Payment Intent |
| `POST` | `/api/payments/confirm` | Confirm payment |
| `POST` | `/api/payments/process` | Process payment (generalized) |
| `POST` | `/api/payments/stripe` | Process Stripe payment (legacy) |
| `PATCH` | `/api/payments/pay` | Update payment status |

---

## 🔔 Notification Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/notification/all` | Get all notifications for user |
| `POST` | `/api/notification/accept` | Accept notification |
| `PUT` | `/api/notification/accept/[notifId]` | Accept notification by ID |
| `POST` | `/api/notification/reject` | Reject notification |
| `PUT` | `/api/notification/reject/[notifId]` | Reject notification by ID |

---

## 📊 Leaderboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/leaderboard/[leagueId]` | Get league leaderboard |

---

## 👑 Superadmin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/superadmin` | Create superadmin |
| `GET` | `/api/superadmin/stats` | Get superadmin statistics |
| `PUT` | `/api/superadmin/[id]` | Update superadmin |
| `DELETE` | `/api/superadmin/[id]` | Delete superadmin |
| `GET` | `/api/superadmin/payments/all` | Get all payments (admin) |
| `GET` | `/api/superadmin/payments/unpaid` | Get all unpaid payments (admin) |

---

## 📧 Invitations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/invite` | Send invitation |

---

## 📤 File Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload file/image to Cloudinary |

---

## 🧪 Testing Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/test-db` | Test database connection |
| `POST` | `/api/test-login` | Test login functionality |
| `POST` | `/api/test-role-mapping` | Test role mapping |
| `POST` | `/api/test-update-role` | Test role update |

---

## 📝 Request/Response Examples

### Login
```http
POST /api/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "player"
  }
}
```

### Create League
```http
POST /api/league
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Spring League 2024",
  "startDate": "2024-03-01",
  "endDate": "2024-06-30",
  "fee": 250
}
```

### Get Payments
```http
GET /api/payments/my?leagueId=507f1f77bcf86cd799439011
Authorization: Bearer <token>
```

### Create Payment Intent
```http
POST /api/payments/create-intent
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentId": "507f1f77bcf86cd799439011"
}

Response:
{
  "success": true,
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx",
  "amount": 250
}
```

### Confirm Payment
```http
POST /api/payments/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentId": "507f1f77bcf86cd799439011",
  "paymentIntentId": "pi_xxx"
}
```

### Accept Notification
```http
PUT /api/notification/accept/507f1f77bcf86cd799439011
Authorization: Bearer <token>
```

---

## 🔒 Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

Token is obtained from `/api/login` endpoint.

---

## 🌐 CORS

All endpoints support CORS with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## 📌 Notes

1. **Dynamic Routes**: Replace `[id]`, `[leagueId]`, `[teamId]`, `[notifId]`, `[code]`, `[playerId]` with actual IDs
2. **Query Parameters**: Some endpoints accept query parameters (e.g., `?leagueId=xxx`)
3. **File Upload**: Use `multipart/form-data` for file uploads
4. **Error Responses**: All errors return JSON with `error` field
5. **Success Responses**: Most successful operations return JSON with `success: true`

---

## 🚀 Quick Reference

**Base URL**: Replace with your server URL
- Development: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

**Common Headers**:
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**Common Status Codes**:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

**Last Updated**: December 2024  
**Version**: 1.0.0

