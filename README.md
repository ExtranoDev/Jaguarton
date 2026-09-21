# EChargeFind — EV charging finder and slot booking

Drivers find a charger on a map (Lagos, Ogun and Oyo), check availability and price, and book a slot. Operators register stations and chargers, set status and price, manage slots and see bookings. Admins oversee the whole platform: accounts, stations, bookings and slot supply.

- `server/` — Node, Express, Knex. SQLite in development, Postgres in production.
- `client/` — React, Vite, Tailwind, Leaflet.

## Run locally

```bash
# API (http://localhost:4000)
cd server
cp .env.example .env
npm install
npm run migrate && npm run seed
npm run dev

# Web app (http://localhost:5173)
cd client
cp .env.example .env
npm install
npm run dev
```

Demo accounts (password `password123`, or `SEED_PASSWORD` if set):

| Account | Role | Sees |
| --- | --- | --- |
| `driver@example.com` | Driver | Every station |
| `operator@example.com` | Operator | Only its own 13 Lagos stations |
| `ogun.operator@example.com` | Operator | Only its own 10 Ogun stations |
| `oyo.operator@example.com` | Operator | Only its own 10 Oyo stations |
| `admin@example.com` | Admin | Everything, through `/admin` |

**Operators only ever see the stations that belong to them:** in their dashboard, on the public station pages (another operator's station is a 404), and for every change. Drivers, admins and anonymous visitors see all stations.

The login page starts empty; it never pre-fills or shows a password.

### Stations across Lagos, Ogun and Oyo

`npm run seed` creates 13 Lagos stations, then 10 in Ogun and 10 in Oyo (with chargers and 7 days of slots), each state owned by its own operator. Coordinates are approximate town centres, good enough for a demo.

To add the Ogun and Oyo stations to a database that already holds data, use `npm run seed:regions` (in `server/`). Unlike `npm run seed` it never deletes anything: it skips any station whose name already exists, so it is safe to re-run. It creates the two operator accounts if they are missing, using `SEED_PASSWORD`; in production it refuses to run without one rather than fall back to `password123`.

Seeded slots only cover the next 7 days. Top them up any time with `npm run slots:topup -- --days 14` (in `server/`), or use "Generate slots" on the operator dashboard.

## Admin

Log in as an admin and you land on `/admin`. Admins can't sign up; the account comes from the seed. Tabs:

| Tab | What it does |
| --- | --- |
| Overview | Counts of users, stations, chargers and bookings, and slot utilisation for the next 7 days. No revenue figures |
| Users | Search and filter accounts. **Add user**, **Edit** (name, email, role), **Reset password** (a generated temporary one, shown once, or one you type), and **Suspend** (with confirmation) or reactivate. Suspension takes effect immediately, even for a token already issued, and blocks login |
| Stations | Deactivate (with confirmation) or reactivate a station, and set any charger online / offline / unavailable |
| Bookings | Filter by status, station and slot date. **Cancel** a booking; a written reason is required, and the slot is freed |
| Slot coverage | Which chargers have days with no slots in the next 7 / 14 / 30 days, and a button to fill the gaps |
| Audit log | Every admin action: who, what, on which target, and the reason |

Rules worth knowing:

- An admin can't suspend themselves, and the last active admin can't be suspended (two admins suspending each other at once can't leave zero).
- A deactivated station disappears from the map, its detail page and its slot list, and can't be booked (409). Bookings that already exist stay confirmed; cancel them from the Bookings tab. The operator still sees the station, flagged as deactivated.
- Utilisation is booked slots ÷ (booked + open slots on online chargers at active stations). Blocked slots don't count.
- A coverage "gap" is a day with no slots at all, and today only counts while a default slot could still be created for it.
- A role can't be changed for an operator who owns stations or a driver who has bookings (suspend the account instead), and you can't change your own role or reset your own password here. There is deliberately no delete: it would cascade through stations and bookings, and suspension covers the safe case.
- A password reset doesn't sign the user out of sessions they already have; they last until the token expires (7 days). Suspend the account if you need someone out now.
- The API lives under `/api/admin/*` and returns 401 without a token and 403 for drivers and operators.

## For everyone: your account

Click your name in the navbar to open **Account**: change your name, and change your password (it asks for the current one; at least 8 characters). If your account is suspended, or your session expires, while you are using the app you are signed out with a message saying why.

## Finding and adding stations

- **Drivers:** the map fits every station (all three states) and follows the list as you filter. Search by name or town (it deliberately ignores street names, so "Ogun" doesn't find Ogunsanya Street), **Near me** sorts by distance, and each station has **Get directions** (opens your maps app).
- **Operators adding a station:** the location map is large (about 60% of the screen height, full width, and full screen on request). Search an address, use your location, click the map, or drag the pin. Address search uses MapTiler when `VITE_MAPTILER_KEY` is set, and OpenStreetMap otherwise.
- **When the API is asleep** (the free host sleeps when idle), the app shows a banner instead of failing silently, retries reads, and the login page says it can't reach the server rather than blaming your password.

## Tests

```bash
cd server && npm test     # Jest + Supertest against SQLite (includes rolling the admin migrations back and forward)
cd client && npm test     # Vitest + React Testing Library + msw
```

To run the API tests against real Postgres (this also exercises the row-lock path in the double-booking tests), point `TEST_DATABASE_URL` at a throwaway database. The suite deletes every row, so never use your real database:

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/echargefind_test npm test
```

## Deploy (Neon + Render + Vercel)

Do these in order. The API needs the database first, and the web app needs the API's URL.

1. **Push the repo to GitHub.**
2. **Neon** — create a project and copy the connection string (`postgres://...neon.tech/...?sslmode=require`). If it ends with `&channel_binding=require`, delete that part; the `pg` driver doesn't need it.
3. **Create the tables and demo data** from your own machine (Render's free tier has no shell). `npm run seed` also creates `admin@example.com`, with `SEED_PASSWORD`:
   ```bash
   cd server
   npm install
   export NODE_ENV=production DATABASE_URL="<neon connection string>" SEED_PASSWORD="<a password for the demo accounts>"
   npm run migrate
   npm run seed
   ```
4. **Render** — New, then Blueprint, pick the repo (it reads `render.yaml`). When prompted set `DATABASE_URL` to the Neon string. Leave `CORS_ORIGIN` blank for now. Note the service URL, e.g. `https://echargefind-api.onrender.com`. Check `<url>/health` returns `{"status":"ok"}`.
5. **Vercel** — import the repo, set the Root Directory to `client`. Add environment variables:
   - `VITE_API_BASE_URL` = `https://echargefind-api.onrender.com/api`
   - `VITE_MAPTILER_KEY` = your MapTiler key (optional; without it the map uses OpenStreetMap tiles)
6. **Back on Render** — set `CORS_ORIGIN` to the Vercel URL (no trailing slash, comma-separate several), which redeploys the API.
7. Log in on the Vercel URL and run through both demo journeys.

### Updating a database that already exists

**This round of changes needs no new migration.** To get the Ogun and Oyo stations onto Neon (this also creates the two operator accounts, so `SEED_PASSWORD` is required):

```bash
cd server
export NODE_ENV=production DATABASE_URL="<neon connection string>" SEED_PASSWORD="<a strong password>"
npm run seed:regions
```

The rest of this section covers the admin section's migrations, from the earlier release.

The admin section adds three migrations: the `admin` role, an `is_active` flag on users and stations, and the `admin_actions` table. Existing rows are kept, and everyone stays active.

Render's build command already runs `npm run migrate`, so redeploying the API applies them to Neon on its own. Running it yourself first is optional, but it lets you see any error before the deploy:

```bash
cd server
export NODE_ENV=production DATABASE_URL="<neon connection string>" SEED_PASSWORD="<the admin's password>"
npm run migrate       # applies the 3 new migrations (Render also does this on every deploy)
npm run seed:admin    # adds admin@example.com; skips it if it already exists. Render never runs this
```

Do **not** run `npm run seed` against a database whose data you want to keep: it deletes every user, station, charger, slot and booking first. `seed:admin` only ever adds the admin. Deploy the API before (or together with) the web app, because the new client calls `/api/admin`, and the API now checks the user's account on every request.

Render's free tier sleeps after 15 minutes idle and takes about a minute to wake. Open `<api url>/health` a couple of minutes before you demo.

### Environment variables

| Where | Name | Purpose |
| --- | --- | --- |
| API | `DATABASE_URL` | Postgres connection string (required in production) |
| API | `JWT_SECRET` | Token signing key. The server refuses to start in production without it |
| API | `CORS_ORIGIN` | Allowed browser origins, comma-separated |
| API | `APP_TIMEZONE` | What "a day" means for slots. Defaults to `Africa/Lagos`, independent of the host clock |
| API | `AUTO_TOP_UP_SLOTS_DAYS` | Optional. Keeps this many days of slots created (checked at boot and every 6 hours) |
| API | `SEED_PASSWORD` | Optional. Password for the seeded demo accounts, including the admin and the Ogun/Oyo operators. Required by `seed:regions` in production |
| Web | `VITE_API_BASE_URL` | API base URL including `/api`. Baked in at build time, so redeploy after changing it |
| Web | `VITE_MAPTILER_KEY` | Optional. Map tiles, and address search when adding a station. Baked in at build time, so redeploy after changing it |
