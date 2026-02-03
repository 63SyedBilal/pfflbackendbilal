# Phoenix Flag Football League API Quick Reference

**Base URL:** `https://api-staging.phoenixflagfootballleague.com/api`

---

## Authentication

| Method | Endpoint         | Description         |
|--------|------------------|---------------------|
| POST   | /api/login       | User login (returns JWT token) |

**Request Example:**
```http
POST /api/login
Content-Type: application/json
{
  "email": "user@example.com",
  "password": "password123"
}
```

---

## Captain APIs

### Create Team
| Method | Endpoint         | Description         |
|--------|------------------|---------------------|
| POST   | /api/team        | Captain creates a new team |

**Request Example:**
```http
POST /api/team
Authorization: Bearer <token>
Content-Type: application/json
{
  "name": "Team Name",
  "leagueId": "...",
  "players": [ ... ]
}
```

---

## Free Agent & Player APIs

### Register as Free Agent
| Method | Endpoint         | Description         |
|--------|------------------|---------------------|
| POST   | /api/user        | Register as free agent/player |

**Request Example:**
```http
POST /api/user
Content-Type: application/json
{
  "name": "Player Name",
  "email": "player@email.com",
  "role": "free-agent"
}
```

### Edit Player Profile
| Method | Endpoint         | Description         |
|--------|------------------|---------------------|
| PUT    | /api/profile/[id]| Edit player profile |

**Request Example:**
```http
PUT /api/profile/123
Authorization: Bearer <token>
Content-Type: application/json
{
  "bio": "Updated bio",
  "position": "QB"
}
```

---

## Superadmin APIs

### Create League
| Method | Endpoint         | Description         |
|--------|------------------|---------------------|
| POST   | /api/league      | Superadmin creates a league |

**Request Example:**
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

---

## Referee APIs

### Add Action to Match
| Method | Endpoint                  | Description         |
|--------|---------------------------|---------------------|
| POST   | /api/match/[id]/action    | Referee adds action to match |

**Request Example:**
```http
POST /api/match/123/action
Authorization: Bearer <token>
Content-Type: application/json
{
  "actionType": "touchdown",
  "playerId": "...",
  "timestamp": "..."
}
```

---

## Stats Keeper APIs

### Edit Player Stats
| Method | Endpoint                  | Description         |
|--------|---------------------------|---------------------|
| PUT    | /api/profile/[id]         | Stats keeper edits player stats |

**Request Example:**
```http
PUT /api/profile/123
Authorization: Bearer <token>
Content-Type: application/json
{
  "stats": {
    "touchdowns": 3,
    "yards": 120
  }
}
```

---

## Notification APIs

### User Notifications
| Method | Endpoint                  | Description         |
|--------|---------------------------|---------------------|
| GET    | /api/notification/all     | Get all notifications for user |

### Superadmin Notifications
| Method | Endpoint                  | Description         |
|--------|---------------------------|---------------------|
| GET    | /api/superadmin/stats     | Get superadmin statistics/notifications |

---

## Using with Postman
- Set the **Base URL** to `https://api-staging.phoenixflagfootballleague.com/api`
- For protected routes, add `Authorization: Bearer <token>` header (token from `/api/login`)
- Use the above endpoints and example payloads to test create, edit, and notification APIs for all user roles.

---

**Note:** Replace `[id]` with actual user, profile, or match IDs as needed.
