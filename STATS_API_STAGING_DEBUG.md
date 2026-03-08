# Why Stats API Works Locally But Not on Staging (404 + HTML)

## Quick checks

### 1. Test if `/api/stats` path is reachable at all

After deploying, open in browser or curl:

```bash
# No auth needed – should return JSON { "ok": true, "message": "Stats API is reachable" }
GET https://api-staging.phoenixflagfootballleague.com/api/stats/ping
```

- **If you get 200 + JSON**  
  The `/api/stats` path is reachable. The problem is likely in how you call **GET/POST /api/stats** (e.g. missing `matchId`, wrong method, or auth).

- **If you get 404 + HTML**  
  The server or something in front of it is not routing `/api/stats/*` to your app. Go to section **“404 on staging”** below.

---

### 2. Call the real stats endpoint correctly

**GET /api/stats** (requires auth + `matchId`):

```bash
curl -X GET "https://api-staging.phoenixflagfootballleague.com/api/stats?matchId=YOUR_MATCH_ID" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

- Missing `?matchId=...` → API returns **400**, not 404.
- Invalid or missing token → **401**.
- Valid request → **200** and JSON.

If you see **404 + HTML** on this exact request, the request is not reaching your Next.js route (see below).

---

## Why you get 404 + HTML on staging (but not locally)

Usually one of these:

### A. Proxy / load balancer not forwarding `/api/stats`

**Symptom:**  
`/api/login` and `/api/health` work, `/api/stats` and `/api/stats/ping` return 404 + HTML.

**Cause:**  
Nginx, Cloudflare, or another reverse proxy in front of the app is only forwarding certain paths (e.g. `/api/login`, `/api/health`) and not **all** of `/api/*`.

**Fix:**  
Configure the proxy to forward **all** `/api/*` to your Next.js app, for example:

- **Nginx:**  
  `location /api/ { proxy_pass http://your-next-app:3000; ... }`
- **Cloudflare / other:**  
  Ensure no rule blocks or rewrites only specific paths; `/api/*` should go to the same origin as `/api/login`.

---

### B. Stale build or wrong deploy

**Symptom:**  
Stats route was added or changed recently; staging was not rebuilt/redeployed after that.

**Fix:**

1. From the project root run a clean build:
   ```bash
   rm -rf .next && npm run build
   ```
2. Deploy the new build (and the new `.next` output).
3. Restart the Node process (e.g. PM2, Docker, or your host’s process manager).
4. Test again:
   - `GET .../api/stats/ping`
   - Then `GET .../api/stats?matchId=...` with a valid token.

---

### C. How the app is started (standalone)

**Symptom:**  
You use `output: 'standalone'` but start the app with `next start` instead of the standalone server.

**Fix:**  
For standalone builds, start the app with the standalone server so the same routes as in dev are available:

```bash
node .next/standalone/server.js
```

(Or the exact command your platform uses to run the standalone build.)  
Ensure the same build that was deployed is the one running.

---

### D. Request URL in production (fixed in code)

Behind a proxy, `req.url` can be relative. The stats handler was updated to use `req.nextUrl.searchParams` for `matchId` so it works in production. After pulling the latest code and redeploying, this part should be fine.

---

## Summary

| Check | What to do |
|-------|------------|
| Is `/api/stats` reachable? | Call **GET .../api/stats/ping**. 200 + JSON = path is OK. |
| Correct stats call? | **GET .../api/stats?matchId=...** with **Authorization: Bearer &lt;token&gt;** |
| 404 + HTML on staging only? | Fix proxy (forward all `/api/*`) and/or do a clean build + redeploy + restart. |

After fixing proxy or deploy, test in this order:

1. `GET .../api/stats/ping` → 200
2. `GET .../api/stats?matchId=VALID_ID` with valid token → 200 or 400/401/404 **JSON**, not HTML.
