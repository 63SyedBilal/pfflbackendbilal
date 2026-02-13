# Player State Schema & Calculation Analysis

## Overview
This document provides a comprehensive analysis of how player states, statistics, and scoring calculations work in the PFFL (Professional Flag Football League) backend system.

---

## 1. PLAYER STATE SCHEMA HIERARCHY

### 1.1 User Model - Player Profile State
**Location:** `modules/user.ts`

```typescript
{
  // Identity
  firstName: String,
  lastName: String,
  email: String (unique),
  phone: String (unique, optional),
  
  // Authentication
  password: String (hashed),
  
  // Role & Status
  role: Enum ["player", "captain", "referee", "stat-keeper", "free-agent", "superadmin"],
  
  // Profile Details
  profileImage: String (Cloudinary URL),
  position: String,
  jerseyNumber: Number,
  emergencyContactName: String,
  emergencyPhone: String,
  profileCompleted: Boolean,
  
  // Aggregated Statistics
  totalPoints: Number (default: 0) ⭐ KEY STAT
  
  // Metadata
  timestamps: { createdAt, updatedAt }
}
```

**Key Insight:** `totalPoints` on User is an aggregated field representing the player's cumulative points across all seasons/leagues.

---

## 2. MATCH-LEVEL PLAYER STATISTICS

### 2.1 PlayerStats Schema (Per Player Per Match)
**Location:** `modules/match.ts` → PlayerStatsSchema

```typescript
{
  playerId: ObjectId (ref: User),
  
  // Offensive Stats
  catches: Number (default: 0),
  catchYards: Number (default: 0),
  rushes: Number (default: 0),
  rushYards: Number (default: 0),
  passAttempts: Number (default: 0),
  passYards: Number (default: 0),
  completions: Number (default: 0),
  touchdowns: Number (default: 0),
  extraPoints: Number (default: 0),
  
  // Defensive Stats
  defensiveTDs: Number (default: 0),
  safeties: Number (default: 0),
  flagPull: Number (default: 0),
  sack: Number (default: 0),
  interceptions: Number (default: 0),
  
  // Calculated Score
  totalPoints: Number (default: 0) ⭐ CALCULATED
}
```

**Structure:** Embedded subdocument within `TeamMatch.playerStats[]` array (not `_id: false`)

---

## 3. POINT CALCULATION LOGIC

### 3.1 Player Individual Points Calculation
**Location:** `controller/stats.ts` → `updatePlayerStats()` [Lines 195-199]

```typescript
// FORMULA:
playerStatEntry.totalPoints = 
  (playerStatEntry.touchdowns || 0) * 6 +           // 6 points per TD
  (playerStatEntry.defensiveTDs || 0) * 6 +         // 6 points per Defensive TD
  (playerStatEntry.extraPoints || 0) * 1 +          // 1 point per Extra Point
  (playerStatEntry.safeties || 0) * 2;              // 2 points per Safety
```

**Scoring Breakdown:**
| Stat | Points | Notes |
|------|--------|-------|
| Touchdown (offensive) | 6 | Catch TD or Rush TD |
| Defensive TD | 6 | Interception/fumble return TD |
| Extra Point | 1 | 5-yard, 12-yard, or 20-yard line conversion |
| Safety | 2 | Tackle in end zone |
| Catches | 0 | Stat tracked but no points |
| Catch Yards | 0 | Stat tracked but no points |
| Rushes | 0 | Stat tracked but no points |
| Flag Pull | 0 | Stat tracked but no points |
| Sack | 0 | Stat tracked but no points |
| Interceptions | 0 | Stat tracked but no points |

**Logic Flow:**
1. When stat-keeper updates player stats via `POST /api/stats`
2. Stats are CUMULATIVE (added to existing values, not replaced)
3. Player's `totalPoints` is recalculated after each update
4. Team stats are then aggregated from all players

---

## 4. TEAM-LEVEL STATISTICS AGGREGATION

### 4.1 TeamStats Schema (Per Team Per Match)
**Location:** `modules/match.ts` → TeamStatsSchema

```typescript
{
  // Aggregated Offensive
  catches: Number,
  catchYards: Number,
  rushes: Number,
  rushYards: Number,
  touchdowns: Number,
  passAttempts: Number,
  passYards: Number,
  completions: Number,
  extraPoints: Number,
  
  // Aggregated Defensive
  defensiveTDs: Number,
  safeties: Number,
  flags: Number,
  
  // Team Score
  totalPoints: Number ⭐ TEAM SCORE
}
```

### 4.2 Team Stats Recalculation
**Location:** `controller/stats.ts` → `updatePlayerStats()` [Lines 209-236]

```typescript
// After each player stat update, recalculate ENTIRE team stats
const newTeamStats = {
  catches: 0, catchYards: 0, rushes: 0, rushYards: 0,
  passAttempts: 0, passYards: 0, completions: 0,
  touchdowns: 0, flagPull: 0, sack: 0, interceptions: 0,
  safeties: 0, extraPoints: 0, defensiveTDs: 0,
  totalPoints: 0
};

// Aggregate from ALL players on team
for (const p of teamData.playerStats) {
  newTeamStats.catches += p.catches || 0;
  newTeamStats.catchYards += p.catchYards || 0;
  newTeamStats.rushes += p.rushes || 0;
  newTeamStats.rushYards += p.rushYards || 0;
  newTeamStats.passAttempts += p.passAttempts || 0;
  newTeamStats.passYards += p.passYards || 0;
  newTeamStats.completions += p.completions || 0;
  newTeamStats.touchdowns += p.touchdowns || 0;
  newTeamStats.flagPull += p.flagPull || 0;
  newTeamStats.sack += p.sack || 0;
  newTeamStats.interceptions += p.interceptions || 0;
  newTeamStats.safeties += p.safeties || 0;
  newTeamStats.extraPoints += p.extraPoints || 0;
  newTeamStats.defensiveTDs += p.defensiveTDs || 0;
  newTeamStats.totalPoints += p.totalPoints || 0;  // Sum all player points
}

teamData.teamStats = newTeamStats;
```

**Key Point:** Team's `totalPoints` = SUM of all player `totalPoints` on that team

---

## 5. MATCH OUTCOME & LEADERBOARD UPDATES

### 5.1 Match Completion Flow
**Location:** `controller/stats.ts` → `approveStats()` [Lines 343-365]

```typescript
// When stats are approved by superadmin:

// 1. Determine match winner based on TEAM SCORES
const teamAScore = match.teamA.score || 0;
const teamBScore = match.teamB.score || 0;

if (teamAScore > teamBScore) {
  match.gameWinnerTeam = teamATeamId;
  match.teamA.win = true;
  match.teamB.win = false;
} else if (teamBScore > teamAScore) {
  match.gameWinnerTeam = teamBTeamId;
  match.teamA.win = false;
  match.teamB.win = true;
} else {
  match.gameWinnerTeam = null;
  match.teamA.win = null;    // Draw
  match.teamB.win = null;
}

match.status = "completed";
await match.save();

// 2. Update leaderboard
await updateLeaderboardFromMatch(matchId);
```

---

## 6. LEADERBOARD STATE CALCULATION

### 6.1 Leaderboard Schema
**Location:** `modules/leaderboard.ts` → LeaderboardTeamSchema

```typescript
{
  teamId: ObjectId (ref: Team),
  
  // W-L-D Record
  wins: Number (default: 0),
  losses: Number (default: 0),
  draws: Number (default: 0),
  
  // Points Statistics
  pointsScored: Number (default: 0),      // Cumulative team points across all matches
  pointsAgainst: Number (default: 0),     // Cumulative points allowed
  pointDifference: Number (default: 0),   // pointsScored - pointsAgainst
  
  // League Ranking
  leaguePoints: Number (default: 0)       // 3 for win, 0 for loss, 0 for draw
}
```

### 6.2 Leaderboard Update Logic
**Location:** `controller/leaderboard.ts` → `updateLeaderboardFromMatch()` [Lines 129-175]

```typescript
// When a match is completed and approved:

// 1. Accumulate team scores and opponent scores
teamAEntry.pointsScored += teamAScore;      // Team A's points in this match
teamAEntry.pointsAgainst += teamBScore;     // Points allowed to Team A
teamBEntry.pointsScored += teamBScore;      // Team B's points in this match
teamBEntry.pointsAgainst += teamAScore;     // Points allowed to Team B

// 2. Update Win/Loss/Draw and league points
if (teamAScore > teamBScore) {
  teamAEntry.wins += 1;
  teamBEntry.losses += 1;
  teamAEntry.leaguePoints += 3;     // Team A gets 3 points
  // teamBEntry gets 0 points
} else if (teamBScore > teamAScore) {
  teamBEntry.wins += 1;
  teamAEntry.losses += 1;
  teamBEntry.leaguePoints += 3;     // Team B gets 3 points
  // teamAEntry gets 0 points
} else {
  teamAEntry.draws += 1;
  teamBEntry.draws += 1;
  // No league points for draw (currently)
}

// 3. Calculate point differential
teamAEntry.pointDifference = teamAEntry.pointsScored - teamAEntry.pointsAgainst;
teamBEntry.pointDifference = teamBEntry.pointsScored - teamBEntry.pointsAgainst;
```

### 6.3 Leaderboard Sorting
**Location:** `controller/leaderboard.ts` → `getLeaderboard()` [Lines 274-283]

```typescript
// Sort by tiebreaker hierarchy:
const sortedTeams = teams.sort((a, b) => {
  // PRIMARY: League Points (most wins/draws)
  if (b.leaguePoints !== a.leaguePoints) {
    return b.leaguePoints - a.leaguePoints;
  }
  
  // SECONDARY: Point Differential (+ margin)
  if (b.pointDifference !== a.pointDifference) {
    return b.pointDifference - a.pointDifference;
  }
  
  // TERTIARY: Points Scored (head-to-head scoring)
  return b.pointsScored - a.pointsScored;
});
```

---

## 7. PLAYER STATE DEPENDENCIES & DATA FLOW

```
┌─────────────────────────────────────────────────────────────┐
│                    MATCH CREATION                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STAT KEEPER SUBMITS STATS (POST /api/stats)               │
│  - Adds player stats (catches, touchdowns, etc.)            │
│  - Players can be updated multiple times                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  CUMULATIVE UPDATE - Each update ADDS to existing values    │
│  playerStatEntry.totalPoints = TDs*6 + DefTDs*6 + EPs*1 +  │
│                                Safeties*2                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TEAM STATS RECALCULATED                                    │
│  teamStats.totalPoints = SUM(all playerStats.totalPoints)  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STATS SUBMITTED FOR APPROVAL                              │
│  (Notification sent to SuperAdmins)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  SUPERADMIN APPROVES STATS (POST /api/stats/approve)        │
│  - Determines winner: if teamA.score > teamB.score          │
│  - Sets gameWinnerTeam, win/loss flags                      │
│  - match.status = "completed"                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  LEADERBOARD UPDATED (updateLeaderboardFromMatch)           │
│  - TeamA: pointsScored += teamAScore                        │
│  - TeamA: pointsAgainst += teamBScore                       │
│  - Winner: leaguePoints += 3                                │
│  - pointDifference = scored - against                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  LEADERBOARD SORTED & RANKED                                │
│  Tiebreaker: leaguePoints → pointDifference → pointsScored  │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. TEAM STRUCTURE & SQUAD MANAGEMENT

### 8.1 Team Schema
**Location:** `modules/team.ts`

```typescript
{
  teamName: String,
  enterCode: String (unique),
  location: String,
  skillLevel: Enum ["beginner", "intermediate", "advanced", "professional"],
  image: String (Cloudinary URL),
  
  // Squad Management
  captain: ObjectId (ref: User) - must be unique,
  squad5v5: [ObjectId] - 5 players for 5v5 format,
  squad7v7: [ObjectId] - 7 players for 7v7 format,
  players: [ObjectId] - union of both squads (auto-synced),
  
  // Virtual field
  allPlayers: [ObjectId] - computed from squad5v5 ∪ squad7v7
}
```

**Auto-Sync Middleware:** When saving Team, `players` array is automatically updated to contain unique union of `squad5v5` and `squad7v7`.

---

## 9. KEY INSIGHTS & OBSERVATIONS

### 9.1 Calculation Characteristics
- ✅ **Cumulative:** Player stats are ADDED to existing values, not replaced
- ✅ **Cascading:** Player points → Team points → Leaderboard updates
- ✅ **Real-time:** Recalculated after every stat submission
- ✅ **Immutable Match:** Once stats are approved, match is marked "completed"

### 9.2 Current Scoring System
| Category | Win | Loss | Draw |
|----------|------|------|------|
| League Points | 3 | 0 | 0 |
| Points for Draw | N/A | N/A | 0 |

**Note:** Draw logic is present but awards 0 points (could be modified to 1 point each)

### 9.3 Player Points NOT Considered
The following are tracked but don't contribute to scoring:
- Catches (count only)
- Catch Yards (yardage only)
- Rushes (count only)
- Rush Yards (yardage only)
- Pass Attempts (count only)
- Pass Yards (yardage only)
- Completions (count only)
- Flag Pulls (defensive metric, count only)
- Sacks (count only)
- Interceptions (count only)

### 9.4 Stat Keeper Role
- Submits stats after match completion
- Stats must be approved by SuperAdmin
- Can update same player multiple times (cumulative)
- Stats can be rejected if corrections needed

---

## 10. API ENDPOINTS INVOLVED

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stats` | POST | Update player stats (Stat Keeper) |
| `/api/stats` | GET | Get match stats |
| `/api/stats/submit` | POST | Submit stats for approval |
| `/api/stats/approve` | POST | Approve stats (SuperAdmin) |
| `/api/stats/reject` | POST | Reject stats for correction |
| `/api/leaderboard/[leagueId]` | GET | Get league standings |

---

## 11. MATCH STATE TRANSITIONS

```
upcoming → continue → completed (after stats approved)
            ↓              ↓
         timesSwitched    gameWinnerTeam set
         (halftime/       leaderboard updated
          fulltime)
```

**Status Meanings:**
- `upcoming` - Not started, can configure players
- `continue` - In progress, sides can be switched
- `completed` - Final stats approved, win/loss determined

---

## 12. POTENTIAL ISSUES & IMPROVEMENTS

### Current Design:
1. **User.totalPoints** field exists but appears unused in current system
   - Currently per-match points calculated but not aggregated to User

2. **Draw Points** - Set to 0, may want 1 point per draw

3. **No negative stats** - No handling for penalty or error corrections at player level

4. **Stat Keeper can resubmit** - For multiple halves (halftime/fulltime marks) or corrections

---

## Summary

The player state system is structured in three tiers:
1. **Individual Player Stats** - Per-player, per-match performance metrics
2. **Team Match Stats** - Aggregated team scores and stats for a specific match
3. **Leaderboard State** - Season-long standings with W-L-D records and points

Scoring is **simple and direct**: only TDs/DefTDs/ExtraPoints/Safeties count toward points, with a strict 6-6-1-2 point allocation system. The system prioritizes data accuracy through an approval workflow and cascading calculation updates.
