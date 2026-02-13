# Referee Action Recording - Updated Behavior

**Date:** February 10, 2026  
**Change Type:** Role Separation Enforcement  
**Impact:** Referee endpoint now records actions ONLY without updating stats

---

## Updated Flow

### Before (❌ Incorrect)
```
Referee Records Action
  ↓
1. Adds to playerActions[]
2. Updates playerStats (WRONG!)
3. Updates teamStats (WRONG!)
4. Updates team score
5. Calculates winner
```

### After (✅ Correct)
```
Referee Records Action (POST /api/match/:id/action)
  ↓
1. Adds to playerActions[]
2. Updates team score ✅
3. Records in immutable actions timeline ✅
4. Does NOT touch playerStats ✅
5. Does NOT touch teamStats ✅
  ↓
Later: Stat Keeper Finalizes (POST /api/stats)
  ↓
1. Updates playerStats based on finalized stats ✅
2. Auto-calculates teamStats from playerStats ✅
3. Updates User.totalPoints (career) ✅
  ↓
Later: Match Completion (PUT /api/match/:id with status="completed")
  ↓
1. Calculates winner based on final score ✅
2. Sets win/lose for each team ✅
```

---

## Code Changes in [controller/match.ts](controller/match.ts)

### Removed: Player Stats Updates

**Before:**
```typescript
// Update player stats
let playerStat = team.playerStats.find((ps: any) =>
  ps.playerId.toString() === playerId
);

if (!playerStat) {
  playerStat = { /* ... initialized ... */ };
  team.playerStats.push(playerStat);
}

// Update stats based on action type
if (actionType === "Touchdown") {
  playerStat.touchdowns = (playerStat.touchdowns || 0) + 1;
  playerStat.totalPoints = (playerStat.totalPoints || 0) + actionScore;
} else if (actionType === "Defensive Touchdown") {
  playerStat.totalPoints = (playerStat.totalPoints || 0) + actionScore;
} else if (actionType.includes("Extra Point")) {
  playerStat.conversionPoints = (playerStat.conversionPoints || 0) + 1;
  playerStat.totalPoints = (playerStat.totalPoints || 0) + actionScore;
} else if (actionType === "Safety") {
  playerStat.safeties = (playerStat.safeties || 0) + 1;
  playerStat.totalPoints = (playerStat.totalPoints || 0) + actionScore;
}
```

**After:**
```typescript
// NOTE: playerStats and teamStats are NOT updated here.
// Only Stat Keeper (via POST /api/stats) updates playerStats and teamStats.
// Referee only records actions and updates score.
```

**Status:** ✅ REMOVED

---

### Removed: Team Stats Updates

**Before:**
```typescript
// Update team stats
if (!team.teamStats) {
  team.teamStats = {};
}

if (actionType === "Touchdown") {
  team.teamStats.touchdowns = (team.teamStats.touchdowns || 0) + 1;
} else if (actionType === "Defensive Touchdown") {
  team.teamStats.touchdowns = (team.teamStats.touchdowns || 0) + 1;
} else if (actionType.includes("Extra Point")) {
  team.teamStats.conversionPoints = (team.teamStats.conversionPoints || 0) + 1;
} else if (actionType === "Safety") {
  team.teamStats.safeties = (team.teamStats.safeties || 0) + 1;
}

// ... later ...
team.teamStats.totalPoints = (team.teamStats.totalPoints || 0) + actionScore;
```

**After:**
```typescript
// (Removed - handled by Stat Keeper only)
```

**Status:** ✅ REMOVED

---

### Simplified: Mark Modified

**Before:**
```typescript
// Mark as modified
(match as any).markModified(isTeamA ? "teamA.playerActions" : "teamB.playerActions");
(match as any).markModified(isTeamA ? "teamA.playerStats" : "teamB.playerStats");
(match as any).markModified(isTeamA ? "teamA.teamStats" : "teamB.teamStats");
(match as any).markModified(scorePath);
```

**After:**
```typescript
// Mark as modified (only playerActions and score)
(match as any).markModified(isTeamA ? "teamA.playerActions" : "teamB.playerActions");
(match as any).markModified(scorePath);
```

**Status:** ✅ UPDATED

---

## Referee Endpoint Responsibilities

### ✅ Handles (Match-Level View)
- Record action in `Match.teamA.playerActions[]` or `Match.teamB.playerActions[]`
- Update `Match.teamA.score` or `Match.teamB.score`
- Record immutable timeline action in `Match.actions[]`
- Update match status to "continue" on first action

### ❌ Does NOT Handle (Reserved for Stat Keeper)
- Update `playerStats` counts (catches, touchdowns, etc.)
- Update `teamStats` aggregates
- Update `User.totalPoints` (career stats)

---

## Stat Keeper Endpoint Responsibilities

### ✅ Handles (Both Levels)
- Read finalized stats from form input
- Validate and update `Match.teamA.playerStats[]`
- Auto-aggregate to `Match.teamA.teamStats`
- Calculate `User.totalPoints` delta
- Atomically update `User.totalPoints` (+= delta)

---

## Match Completion Flow

### Status: Completed (PUT /api/match/:id)
```typescript
if (status === "completed") {
  // 1. Calculate winner based on Match.teamA.score vs Match.teamB.score
  const teamAScore = (match as any).teamA.score || 0;
  const teamBScore = (match as any).teamB.score || 0;
  
  if (teamAScore > teamBScore) {
    // Team A wins
    (match as any).gameWinnerTeam = teamATeamId;
    (match as any).teamA.win = true;
    (match as any).teamB.win = false;
  } else if (teamBScore > teamAScore) {
    // Team B wins
    (match as any).gameWinnerTeam = teamBTeamId;
    (match as any).teamA.win = false;
    (match as any).teamB.win = true;
  } else {
    // Tie game
    (match as any).gameWinnerTeam = null;
    (match as any).teamA.win = null;
    (match as any).teamB.win = null;
  }
}
```

**Status:** ✅ IN PLACE

---

## Data Consistency Guarantee

### Never Updated by Referee
- ❌ `playerStats.totalPoints`
- ❌ `playerStats.touchdowns`
- ❌ `playerStats.conversionPoints`
- ❌ `playerStats.safeties`
- ❌ `teamStats.totalPoints`
- ❌ `teamStats.touchdowns`
- ❌ `teamStats.conversionPoints`
- ❌ `User.totalPoints`

### Only Updated by Stat Keeper
- ✅ `playerStats.*` (all fields)
- ✅ `teamStats.*` (all fields)
- ✅ `User.totalPoints` (via atomic delta)

---

## Testing Checklist

- [ ] Referee action endpoint: records action but NOT playerStats
- [ ] Referee action endpoint: records action but NOT teamStats
- [ ] Referee action endpoint: updates team score correctly
- [ ] Referee action endpoint: updates actions[] timeline
- [ ] Stat Keeper endpoint: updates playerStats from input
- [ ] Stat Keeper endpoint: auto-calculates teamStats from playerStats
- [ ] Stat Keeper endpoint: updates User.totalPoints with delta
- [ ] Match completion: calculates winner based on final score
- [ ] Match completion: sets win/lose on both teams

---

## Migration Notes

If frontend was sending stats to referee endpoint:
1. ❌ **Stop sending playerStats** to POST /api/match/:id/action
2. ❌ **Stop sending teamStats** to POST /api/match/:id/action  
3. ✅ **Only send** `teamId`, `playerId`, `actionType`
4. ✅ **Send finalized stats** to POST /api/stats (Stat Keeper only)

---

## Security Impact

**Before:** Any role could implicitly update stats through referee actions  
**After:** Stats are decoupled from actions; only Stat Keeper can update stats  
**Result:** No way to manipulate career statistics via referee endpoint

