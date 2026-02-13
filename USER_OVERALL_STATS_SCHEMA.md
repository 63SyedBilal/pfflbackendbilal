# User Overall Stats Schema - Cumulative Player Performance

**Date:** February 10, 2026  
**Schema:** `User.stats` (OverallPlayerStatsSchema)  
**Purpose:** Track cumulative player statistics across all matches

---

## Schema Structure

### OverallPlayerStatsSchema (embedded in User)

```typescript
User.stats = {
  // Offensive - cumulative across all matches
  catches: Number,           // Total catches across all matches
  catchYards: Number,        // Total catch yards across all matches
  rushes: Number,            // Total rushes across all matches
  rushYards: Number,         // Total rushing yards across all matches
  passAttempts: Number,      // Total pass attempts across all matches
  passYards: Number,         // Total passing yards across all matches
  completions: Number,       // Total completions across all matches
  touchdowns: Number,        // Total touchdowns across all matches (all types)
  conversionPoints: Number,  // Total conversion points across all matches

  // Defensive / misc - cumulative across all matches
  safeties: Number,      // Total safeties across all matches
  flagPull: Number,      // Total flag pulls across all matches
  sack: Number,          // Total sacks across all matches
  interceptions: Number, // Total interceptions across all matches (INT)

  // Calculated
  totalPoints: Number,         // Sum of all match points (TDs*6 + EPs*1 + Safeties*2)
  matchesPlayed: Number,       // Count of matches player participated in
  lastUpdated: Date            // When stats were last updated by Stat Keeper
}
```

---

## Data Flow

### Match-Level Stats (Ephemeral per Match)
```
Match.teamA.playerStats[0] = {
  playerId: "player_123",
  touches: 5,
  yards: 50,
  tensordowns: 2,
  totalPoints: 12
}
```

### User-Level Stats (Cumulative across all matches)
```
User.stats = {
  catches: 42,           // Sum of all match catches
  catchYards: 456,       // Sum of all match catch yards
  touchdowns: 23,        // Sum of all match touchdowns
  totalPoints: 145,      // Sum of all match totalPoints
  matchesPlayed: 8,      // Number of matches player participated in
  lastUpdated: "2026-02-10T15:30:00Z"
}
```

---

## Update Process (Stat Keeper Workflow)

### Step 1: Referee Records Actions
- Referee posts actions via `POST /api/match/:id/action`
- Only records to `Match.playerActions[]`
- Does NOT update stats

### Step 2: Stat Keeper Finalizes Stats
- Calls `POST /api/stats` with finalized stats
- **Stat Keeper must verify role:** `decoded.role === "stat-keeper"`

### Step 3: Update Match Stats
```typescript
Match.teamA.playerStats[0] = {
  playerId: "player_123",
  catches: 5,
  touchdowns: 2,
  totalPoints: 12
}
```

### Step 4: Calculate Deltas
```typescript
// Compare new vs old values
oldCatches = 3  (from previous update)
newCatches = 5  (in this update)
delta = 5 - 3 = 2 catches added
```

### Step 5: Update User.stats (Atomic)
```typescript
await User.findByIdAndUpdate(
  playerObjectId,
  {
    $inc: {
      'stats.catches': 2,        // Add delta
      'stats.totalPoints': 6,    // Add points delta
      'stats.matchesPlayed': 1   // Only if new match entry
    },
    $set: {
      'stats.lastUpdated': new Date()
    }
  }
)
```

### Result
```
User.stats BEFORE:
  catches: 3
  totalPoints: 6
  matchesPlayed: 1

User.stats AFTER:
  catches: 5        ← +2
  totalPoints: 12   ← +6
  matchesPlayed: 1  ← no change (not new entry)
```

---

## Multi-Match Accumulation Example

### Match 1 - Player Zubair
```
Match.teamA.playerStats[] = [
  {
    playerId: zubair_id,
    catches: 4,
    touchdowns: 3,
    conversionPoints: 2,
    totalPoints: 8  // 3*6 + 2*1 = 20? Let me recalculate: 3*6=18, ignore safeties
  }
]

Result: User(zubair).stats = {
  catches: 4,
  touchdowns: 3,
  conversionPoints: 2,
  totalPoints: 20,
  matchesPlayed: 1
}
```

### Match 2 - Player Zubair
```
Match.teamB.playerStats[] = [
  {
    playerId: zubair_id,
    catches: 1,
    touchdowns: 4,
    conversionPoints: 0,
    totalPoints: 24  // 4*6 = 24
  }
]

Deltas: catches +1, touchdowns +1, conversionPoints -2, points +24

Result: User(zubair).stats = {
  catches: 5,       ← 4+1
  touchdowns: 7,    ← 3+4
  conversionPoints: 0,  ← 2-2
  totalPoints: 44,  ← 20+24
  matchesPlayed: 2
}
```

### Match 3 - Player Zubair
```
Match.teamA.playerStats[] = [
  {
    playerId: zubair_id,
    catches: 3,
    touchdowns: 2,
    conversionPoints: 1,
    totalPoints: 13  // 2*6 + 1*1 = 13
  }
]

Deltas: catches +3, touchdowns -5, conversionPoints +1, points +13

Result: User(zubair).stats = {
  catches: 8,       ← 5+3
  touchdowns: 9,    ← 7+2
  conversionPoints: 1,  ← 0+1
  totalPoints: 57,  ← 44+13
  matchesPlayed: 3
}
```

---

## Key Guarantees

### ✅ Atomicity
- All User.stats updates happen atomically (single database operation)
- No partial updates or race conditions

### ✅ Accuracy
- Only Stat Keeper can update (role check enforced)
- Deltas are calculated from match-level before/after values
- No double-counting or stat corruption

### ✅ Traceability
- `stats.matchesPlayed` shows how many matches player participated in
- `stats.lastUpdated` shows when stats were last finalized

### ✅ Backward Compatibility
- `User.totalPoints` still updated (legacy field)
- `User.stats.totalPoints` mirrors it (new field)
- Migration path: clients can switch to `User.stats` gradually

---

## Schema Fields Explained

| Field | Type | Example | Updated By |
|-------|------|---------|-----------|
| catches | Number | 42 | Stat Keeper (cumulative) |
| catchYards | Number | 456 | Stat Keeper (cumulative) |
| rushes | Number | 87 | Stat Keeper (cumulative) |
| rushYards | Number | 523 | Stat Keeper (cumulative) |
| passAttempts | Number | 45 | Stat Keeper (cumulative) |
| passYards | Number | 892 | Stat Keeper (cumulative) |
| completions | Number | 34 | Stat Keeper (cumulative) |
| touchdowns | Number | 23 | Stat Keeper (cumulative) |
| conversionPoints | Number | 18 | Stat Keeper (cumulative) |
| safeties | Number | 2 | Stat Keeper (cumulative) |
| flagPull | Number | 5 | Stat Keeper (cumulative) |
| sack | Number | 12 | Stat Keeper (cumulative) |
| interceptions | Number | 8 | Stat Keeper (cumulative) |
| totalPoints | Number | 145 | Stat Keeper (calculated sum) |
| matchesPlayed | Number | 8 | Stat Keeper (match count) |
| lastUpdated | Date | 2026-02-10T15:30Z | Stat Keeper (on each update) |

---

## Query Examples

### Get Player's Overall Stats
```javascript
const user = await User.findById(playerId);
console.log(user.stats); // { catches: 42, touchdowns: 23, totalPoints: 145, ... }
```

### Get All Players and Their Stats
```javascript
const players = await User.find({ role: 'player' }, { stats: 1, firstName: 1, lastName: 1 });
// Returns: [{ firstName: "Zubair", stats: { catches: 42, ... } }, ...]
```

### Find Top Scorers (by totalPoints)
```javascript
const topScorers = await User.find({ role: 'player' })
  .sort({ 'stats.totalPoints': -1 })
  .limit(10);
```

### Find Most Active Players (by matchesPlayed)
```javascript
const mostActive = await User.find({ role: 'player' })
  .sort({ 'stats.matchesPlayed': -1 })
  .limit(10);
```

---

## Testing Checklist

- [ ] Stat Keeper updates player stats in Match 1 → User.stats incremented
- [ ] Stat Keeper updates same player in Match 2 → User.stats further incremented (delta applied)
- [ ] New player entry created → matchesPlayed incremented
- [ ] Stats corrected/adjusted → deltas applied correctly (negative deltas possible)
- [ ] Verify User.totalPoints mirrors User.stats.totalPoints
- [ ] Verify lastUpdated timestamp is current
- [ ] Multiple stat updates in same match → correct cumulative totals

---

## Migration Notes

### For Frontend
1. Previously: `User.totalPoints` (single number for career points)
2. Now: `User.stats` (complete breakdown of all stats)
3. Recommendation: Display both initially, migrate to `User.stats` for detailed profile

### For Reports/Analytics
- Can now see breakdown of player performance (not just total points)
- Example: "Player had 23 TDs, 18 EPs = 156 points" (23*6 + 18*1 = 156)

### For Leaderboards
- **By Points:** Sort by `stats.totalPoints`
- **By Matches:** Sort by `stats.matchesPlayed`
- **By Activity:** Filter by `stats.lastUpdated` (recent updates)

