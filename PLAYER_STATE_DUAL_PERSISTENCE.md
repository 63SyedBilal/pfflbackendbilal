# Player State Persistence Analysis: Dual-State System

## Overview
The system maintains **TWO distinct player state records** for each player:
1. **Match-Specific State** - Stats for a specific match only
2. **Overall Career State** - Cumulative stats across all matches

---

## 1. MATCH-LEVEL PLAYER STATE
**Stored in:** `Match.teamA/teamB.playerStats[]` (embedded subdocument)

### Schema Structure
**File:** [modules/match.ts](modules/match.ts#L5-L28)

```typescript
PlayerStatsSchema = {
  playerId: ObjectId,
  
  // Match-specific stats
  catches: Number,
  catchYards: Number,
  rushes: Number,
  rushYards: Number,
  touchdowns: Number,
  extraPoints: Number,
  defensiveTDs: Number,
  safeties: Number,
  flags: Number,
  
  // Match-specific score
  totalPoints: Number  ← THIS MATCH ONLY
}
```

### How It's Saved

**Location:** [controller/match.ts#L970-L1040](controller/match.ts#L970-L1040)

When a Referee records a live action (TD, ExtraPoint, Safety):

```typescript
// Find or create player stat entry for THIS match
let playerStat = team.playerStats.find(ps => 
  ps.playerId.toString() === playerObjectId.toString()
);

if (!playerStat) {
  playerStat = {
    playerId: playerObjectId,
    catches: 0, catchYards: 0, rushes: 0, rushYards: 0,
    touchdowns: 0, extraPoints: 0, defensiveTDs: 0,
    safeties: 0, flags: 0, totalPoints: 0
  };
  team.playerStats.push(playerStat);
}

// Update based on action
if (actionType === "Touchdown") {
  playerStat.touchdowns += 1;
  playerStat.totalPoints += 6;  // 6 points per TD
} else if (actionType.includes("Extra Point")) {
  playerStat.extraPoints += 1;
  playerStat.totalPoints += 1;  // 1 point per EP
} else if (actionType === "Safety") {
  playerStat.safeties += 1;
  playerStat.totalPoints += 2;  // 2 points per safety
}

// Save to Match document
await match.save();  ← PERSISTS IN MATCH COLLECTION
```

**Persistence Method:** Embedded in Match document, saved to `Match` collection

---

## 2. OVERALL PLAYER STATE (CAREER)
**Stored in:** `User.totalPoints` (user document)

### Schema Structure
**File:** [modules/user.ts](modules/user.ts#L63-L66)

```typescript
UserSchema = {
  // ... other fields ...
  
  totalPoints: {
    type: Number,
    default: 0
  }  ← CUMULATIVE ACROSS ALL MATCHES
}
```

### How It's Saved

**Location:** [controller/match.ts#L1089-L1095](controller/match.ts#L1089-L1095)

When a Referee records any action that awards points:

```typescript
// Update User (Player Stats) - Increment totalPoints
if (playerObjectId) {
  await User.findByIdAndUpdate(
    playerObjectId,
    { $inc: { totalPoints: actionScore } }  ← CUMULATIVE INCREMENT
  );
}
```

**Persistence Method:** Direct update to `User` document via `$inc` operator (atomic increment)

---

## 3. DATA FLOW & PERSISTENCE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│         REFEREE RECORDS ACTION (TD, Safety, EP)             │
│  POST /api/match/[matchId]/action                           │
└─────────────────────────────────────────────────────────────┘
                      ↓ actionScore = points
        ┌─────────────────────────────┐
        │                             │
        ↓                             ↓
        
┌─────────────────────────┐    ┌─────────────────────────┐
│  MATCH COLLECTION       │    │  USER COLLECTION        │
│  (Match-Specific)       │    │  (Career Cumulative)    │
│                         │    │                         │
│ Match: {                │    │ User: {                 │
│   teamA: {              │    │   _id: 123,             │
│     playerStats: [{     │    │   firstName: "John",    │
│       playerId: 5,      │    │   totalPoints: 0        │
│       touchdowns: 1, ←──┼────┼─→ ↓ $inc: +6            │
│       totalPoints: 6 ←──┼────┼─→ totalPoints: 6        │
│     }]                  │    │ }                       │
│   },                    │    │                         │
│   status: "continue"    │    │                         │
│ }                       │    │                         │
└─────────────────────────┘    └─────────────────────────┘
        ↓ save()                        ↓ $inc update
    PERSIST                         PERSIST (atomic)
```

---

## 4. STAT KEEPER UPDATE vs REFEREE LIVE ACTIONS

### Stat Keeper (Post-Match Stats Update)
**File:** [controller/stats.ts](controller/stats.ts#L103-L250)

```typescript
// POST /api/stats (Stat Keeper only, after match)
export async function updatePlayerStats(req: NextRequest) {
  // ...
  
  // Find or create player stat entry
  let playerStatEntry = teamData.playerStats.find(ps =>
    ps.playerId.toString() === playerObjectId.toString()
  );
  
  if (!playerStatEntry) {
    playerStatEntry = { playerId, touches: 0, ... };
    teamData.playerStats.push(playerStatEntry);
  }
  
  // CUMULATIVE: Add new stats to existing
  playerStatEntry.catches = (playerStatEntry.catches || 0) + (stats.catches || 0);
  playerStatEntry.touchdowns = (playerStatEntry.touchdowns || 0) + (stats.touchdowns || 0);
  
  // Recalculate player points
  playerStatEntry.totalPoints = 
    (playerStatEntry.touchdowns || 0) * 6 +   // 6 points per TD
    (playerStatEntry.defensiveTDs || 0) * 6 + // 6 points per Defensive TD
    (playerStatEntry.extraPoints || 0) * 1 +  // 1 point per EP
    (playerStatEntry.safeties || 0) * 2;      // 2 points per safety
  
  // Recalculate team stats (sum all players)
  const newTeamStats = { ... };
  for (const p of teamData.playerStats) {
    newTeamStats.totalPoints += p.totalPoints || 0;
  }
  teamData.teamStats = newTeamStats;
  
  // Save match
  await match.save();  ← UPDATES MATCH COLLECTION
}
```

**Updates:**
- ✅ Match-level player stats (`Match.teamA.playerStats`)
- ✅ Match-level team stats (`Match.teamA.teamStats`)
- ❌ Does NOT directly update `User.totalPoints`

---

### Referee (Live Action Recording)
**File:** [controller/match.ts](controller/match.ts#L920-L1095)

```typescript
// POST /api/match/[matchId]/action (Referee real-time)
export async function recordMatchAction(req: NextRequest) {
  // ...
  
  // Update player stats in match
  playerStat.totalPoints += actionScore;
  team.playerStats.push(playerStat);
  
  // Update match document
  await match.save();  ← UPDATES MATCH COLLECTION
  
  // ALSO update User.totalPoints (atomic increment)
  await User.findByIdAndUpdate(
    playerObjectId,
    { $inc: { totalPoints: actionScore } }  ← UPDATES USER COLLECTION
  );
}
```

**Updates:**
- ✅ Match-level player stats (`Match.teamA.playerStats`)
- ✅ Match-level team stats (`Match.teamA.teamStats`)
- ✅ Career stats (`User.totalPoints`) ← ATOMIC INCREMENT

---

## 5. KEY DIFFERENCES: STAT KEEPER vs REFEREE

| Aspect | Stat Keeper | Referee |
|--------|-----------|---------|
| **Endpoint** | `POST /api/stats` | `POST /api/match/[matchId]/action` |
| **Timing** | After match completion | During/after match (real-time) |
| **Match Stats Update** | ✅ Yes | ✅ Yes |
| **User.totalPoints Update** | ❌ No direct update | ✅ Yes (atomic $inc) |
| **Multiple Updates** | ✅ Cumulative adds | ✅ Cumulative adds |
| **Approval** | Requires SuperAdmin approval | Automatic |

---

## 6. CRITICAL ISSUE IDENTIFIED ⚠️

### Problem: Stat Keeper doesn't update User.totalPoints

When Stat Keeper updates player stats via `POST /api/stats`:

```typescript
// ✅ Updates Match document
match.teamA.playerStats[0].totalPoints = 12;
await match.save();

// ❌ Does NOT update User document
// User.totalPoints remains 0 if Referee didn't record actions

User.totalPoints = 0  // MISSING UPDATE!
```

This means if **only** Stat Keeper inputs stats (without live Referee actions):
- Player stats exist in Match ✅
- But User.totalPoints is NOT incremented ❌
- Player's career stats are incomplete

### Solution Needed:
Stat Keeper should also update User.totalPoints when finalizing stats, similar to Referee:

```typescript
// After calculating playerStatEntry.totalPoints
const pointsIncrement = playerStatEntry.totalPoints - (originalPoints || 0);
await User.findByIdAndUpdate(
  playerObjectId,
  { $inc: { totalPoints: pointsIncrement } }
);
```

---

## 7. TWO SCENARIOS ILLUSTRATED

### Scenario A: Referee Records Live + Stat Keeper Submits
```
Time 1: Referee records TD during match
  → Match.playerStats.touchdowns = 1
  → Match.playerStats.totalPoints = 6
  → User.totalPoints = 6  ✅

Time 2: Stat Keeper submits stats for approval
  → Match.playerStats.touchdowns = 1 (confirmed)
  → Match.playerStats.totalPoints = 6 (confirmed)
  → User.totalPoints = 6  (already set from Referee)
  → Stats approved
```

### Scenario B: Only Stat Keeper (No Live Actions)
```
Time 1: Referee does nothing
  → Match.playerStats = empty
  → User.totalPoints = 0

Time 2: Stat Keeper inputs full match stats
  → Match.playerStats.touchdowns = 2
  → Match.playerStats.totalPoints = 12  ✅
  → User.totalPoints = 0  ❌ PROBLEM!
  → Stats approved but User career stats not updated
```

---

## 8. PERSISTENCE COLLECTION SUMMARY

### Match Collection
- **Per Match Stats:** Yes ✅
- **Embedded Player Stats:** Yes ✅
- **Contains:** All match-specific statistics
- **Queried by:** Referee, Stat Keeper, SuperAdmin
- **Example:** `db.matches.find({ _id: matchId }).playerStats`

### User Collection
- **Career Stats:** Yes ✅
- **Single Field:** `totalPoints` only
- **Updated by:** Referee (automatic), Stat Keeper (needs fix)
- **Queried by:** Leaderboard, player profiles, stats dashboard
- **Example:** `db.users.find({ _id: userId }).totalPoints`

### Leaderboard Collection
- **Team Rankings:** Yes ✅
- **Derived from:** Match results (not directly from player stats)
- **Contains:** W-L-D, pointsFor, pointsAgainst, pointDiff
- **Not:** Individual player career stats

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│              PLAYER STATE: DUAL STORAGE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. MATCH-SPECIFIC STATE                                    │
│    Location: Match.teamA/teamB.playerStats[]               │
│    Updates: Referee actions + Stat Keeper submissions      │
│    Persistence: Match document (embedded)                  │
│    Queryable: Yes (from Match)                             │
│                                                             │
│ 2. CAREER STATE                                            │
│    Location: User.totalPoints                              │
│    Updates: Referee actions ONLY ⚠️                         │
│    Persistence: User document (atomic $inc)                │
│    Queryable: Yes (from User)                              │
│    Status: INCOMPLETE (Stat Keeper doesn't update)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**ACTION ITEM:** Add User.totalPoints increment to Stat Keeper update function to ensure player career stats stay synchronized.
