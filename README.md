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
| Users | Search and filter accounts. **Add user**, **Edit** (name, email, role), **Reset password** (a generated temporary one, shown once, or one you type), and **Suspend** (with confirmation and a reason) or reactivate. Suspension takes effect immediately, even for a token already issued, and blocks login |
| Stations | Filter by **Pending approval**, Approved, Rejected or Archived. **Approve** a new station, or **Reject** it with a reason the operator sees. Deactivate (with confirmation and a reason) or reactivate a station, and set any charger online / offline / unavailable |
| Bookings | Filter by status, station and slot date. **Cancel** a booking; a written reason is required, and the slot is freed |
| Slot coverage | Which chargers have days with no slots in the next 7 / 14 / 30 days, and a button to fill the gaps |
| Audit log | Everything recorded (see below), filtered by who, kind, action, target and date range, 50 to a page with no limit on how far back you can go. Each entry shows the date with the year and the time in Lagos time, who did it, the target, the reason, what changed (before → after) and the IP address |

Rules worth knowing:

- **A written reason (at least 5 characters) is required** to suspend an account, deactivate a station, cancel a booking, change someone's role and reset a password. It is kept in the audit log. Reactivating takes none.

- An admin can't suspend themselves, and the last active admin can't be suspended (two admins suspending each other at once can't leave zero).
- A deactivated station disappears from the map, its detail page and its slot list, and can't be booked (409). Bookings that already exist stay confirmed; cancel them from the Bookings tab. The operator still sees the station, flagged as deactivated.
- **New stations need approval.** A station an operator adds is *pending* and hidden from drivers until an admin approves it (the overview counts how many are waiting). A rejected station shows the admin's reason to its operator; editing it sends it back for approval. Stations that existed before this rule, and seeded ones, are approved.
- **Taking a charger offline or unavailable while drivers are booked on it asks first.** The API answers 409 (`code: CONFIRM_REQUIRED`, with `upcomingBookings`) unless the request says `confirm: true`, for operators and admins alike. The bookings stay confirmed, and the audit log records how many there were.
- Suspending an operator hides all of their stations from drivers (map, detail page, slot lists) and makes them unbookable (409), exactly like deactivating each one. Their existing bookings stay confirmed; cancel them from the Bookings tab if needed. The Stations tab's data carries `owner_active` for each station.
- Utilisation is booked slots ÷ (booked + open slots on online chargers at active stations whose operator isn't suspended). Blocked slots don't count.
- A coverage "gap" is a day with no slots at all, and today only counts while a default slot could still be created for it.
- A role can't be changed for an operator who owns stations or a driver who has bookings (suspend the account instead), and you can't change your own role or reset your own password here. There is deliberately no delete: it would cascade through stations and bookings, and suspension covers the safe case.
- A password reset or a role change signs the user out everywhere: every token issued before it stops working (401) and they log in again. Suspension still takes effect immediately too.
- The API lives under `/api/admin/*` and returns 401 without a token and 403 for drivers and operators.

## Audit log

One history of what happened, kept in the `audit_log` table:

- **Security:** sign-ups, logins, failed logins, lockouts, logins refused because the account is suspended, password and profile changes.
- **Operator changes:** stations, chargers (including status), slots generated, topped up, blocked, unblocked and deleted.
- **Bookings:** made and cancelled, by drivers, operators and admins.
- **Admin actions:** everything on the admin screens.

Each entry is a snapshot. The name and email of whoever acted and of the target are copied in when it is written, along with before → after values, the reason, the IP address and the browser. Entries have no foreign keys, so renaming or deleting a user never changes or blocks the history.

Entries are kept forever, except failed logins, which are deleted 90 days after they happen. The API checks for expired ones when it starts and every 6 hours. `npm run seed` never deletes the audit log.

**Operators** get a read-only **History** tab on each of their stations: everything above that happened at that station. Drivers' emails are shown masked (`c***@example.com`), admins appear as "EChargeFind admin", and IP addresses are left out (`GET /api/operator/history`).

## For everyone: your account

Click your name in the navbar to open **Account**: change your name, and change your password (it asks for the current one; at least 8 characters). Changing your password signs you out on every other device; you stay signed in where you changed it. If your account is suspended, or your session expires, while you are using the app you are signed out with a message saying why.

Rules that apply to every account:

- **Passwords** must be at least 8 characters wherever one is set (sign-up, Account, admin). Older, shorter passwords still work for logging in.
- **Emails are not case-sensitive.** They are stored in lower case, `Ada@Example.com` and `ada@example.com` are the same account, and you can log in with either.
- **Login throttling:** after 10 wrong passwords for one email from one IP address within 15 minutes, further attempts from there (even with the right password) get "Too many failed login attempts" (429, with a `Retry-After` header) until the oldest failure is 15 minutes old. An unknown email is treated exactly like a wrong password, and takes as long, so neither the message nor the timing reveals who has an account. The counter lives in the API's memory (it runs as one instance), so a restart clears it.

## Booking rules

- A slot that has already started can't be booked (409), even if it is still marked available.
- A driver can't hold two confirmed bookings whose times overlap, at any station (409, naming the booking that clashes). Cancelling one frees the time again.
- Operators can create slots from today up to 90 days ahead; slots that have already started are never created.

## API input limits

Anything outside these is a 400 with a message saying which field is wrong (never a 500): ids must be whole numbers from 1 to 2,147,483,647; names up to 100 characters (people) or 120 (stations); addresses up to 255; emails up to 254; passwords 8 to 128 characters; charger power more than 0 and at most 1000 kW; price more than 0 and at most ₦100,000 per kWh; text fields must be text (not objects or lists), and list filters must be single values. Malformed JSON is a 400 and a body over 100 kB is a 413. Every response carries security headers (`nosniff`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy: no-referrer`, a deny-all CSP) and no `X-Powered-By`.

## Finding and adding stations

- **Drivers:** the map fits every station (all three states) and follows the list as you filter. Search by name or town (it deliberately ignores street names, so "Ogun" doesn't find Ogunsanya Street), **Near me** sorts by distance, and each station has **Get directions** (opens your maps app).
- **Operators managing stations:**
  - **Edit station** changes the name, address and location.
  - **Slots: block or unblock** on each charger shows its slots for the next 7 days. Block one so nobody can book it; booked and already-started slots can't be changed.
  - **Archive** a station or a charger to take it out of service. Drivers stop seeing it and it can't be booked, but its bookings and history are kept and **Restore** brings it back. Something with upcoming bookings can't be archived until those are cancelled.
  - **Cancel** an upcoming booking from the station's Bookings tab, with a reason (at least 5 characters) that the audit log keeps. The slot is freed. On phones the bookings list shows one card per booking.
- **Operators adding a station:** the location map is large (about 60% of the screen height, full width, and full screen on request). Search an address, use your location, click the map, or drag the pin. Address search uses MapTiler when `VITE_MAPTILER_KEY` is set, and OpenStreetMap otherwise.
- **When the API is asleep** (the free host sleeps when idle), the app shows a banner instead of failing silently, retries reads, and the login page says it can't reach the server rather than blaming your password.

## Tests

```bash
cd server && npm test     # Jest + Supertest against SQLite (includes rolling the migrations back and forward)
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
3. **Create the tables and demo data** from your own machine (Render's free tier has no shell). `npm run seed` also creates `admin@example.com`, with `SEED_PASSWORD`. Because it starts by deleting everything, it refuses to run with `NODE_ENV=production` unless you also set `ALLOW_DESTRUCTIVE_SEED=yes`; only do that for a brand-new, empty database:
   ```bash
   cd server
   npm install
   export NODE_ENV=production DATABASE_URL="<neon connection string>" SEED_PASSWORD="<a password for the demo accounts>"
   npm run migrate
   ALLOW_DESTRUCTIVE_SEED=yes npm run seed   # new, empty database only
   ```
4. **Render** — New, then Blueprint, pick the repo (it reads `render.yaml`). When prompted set `DATABASE_URL` to the Neon string. Leave `CORS_ORIGIN` blank for now. Note the service URL, e.g. `https://echargefind-api.onrender.com`. Check `<url>/health` returns `{"status":"ok"}`.
5. **Vercel** — import the repo, set the Root Directory to `client`. Add environment variables:
   - `VITE_API_BASE_URL` = `https://echargefind-api.onrender.com/api`
   - `VITE_MAPTILER_KEY` = your MapTiler key (optional; without it the map uses OpenStreetMap tiles)
6. **Back on Render** — set `CORS_ORIGIN` to the Vercel URL (no trailing slash, comma-separate several), which redeploys the API.
7. Log in on the Vercel URL and run through both demo journeys.

### Updating a database that already exists

**Station approval and archiving (migration `20260101000012_station_approval_and_archiving`).** This adds `stations.approval_status` (every existing station becomes `approved`), `stations.review_note`, and `archived_at` on stations and chargers (empty for all). No data changes. Render runs it on deploy.

**Audit log (migration `20260101000011_create_audit_log`).** This creates `audit_log`, copies every existing `admin_actions` row into it (resolving the admin's and the target's names and emails at that moment), and drops `admin_actions`. Render runs it on deploy.

**Safety and robustness (migration `20260101000010_case_insensitive_emails_and_token_version`).** Render runs it on deploy. It:

- lower-cases every stored email and adds a unique index on `lower(email)`;
- adds `users.token_version` (0 for everyone). Tokens issued before this release have no version, count as 0 and keep working until they expire or the user's password or role changes.

If two existing accounts differ only by the case of their email, the migration stops before changing anything and names the address; Render's build then fails and the previous deploy stays live. Rename or merge one of the two accounts, then deploy again. To see in advance whether that will happen, run this read-only query against Neon: `SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1;` (no rows means it will go through).

Nothing else changes in the data. Deploy the API and the web app together: the new web app stores the fresh token that a password change now returns.

The Ogun and Oyo stations, from the release before, are added with `seed:regions` (this also creates the two operator accounts, so `SEED_PASSWORD` is required):

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

Do **not** run `npm run seed` against a database whose data you want to keep: it deletes every user, station, charger, slot and booking first (and with `NODE_ENV=production` it refuses unless `ALLOW_DESTRUCTIVE_SEED=yes`). `seed:admin` only ever adds the admin. Deploy the API before (or together with) the web app, because the new client calls `/api/admin`, and the API now checks the user's account on every request.

Render's free tier sleeps after 15 minutes idle and takes about a minute to wake. Open `<api url>/health` a couple of minutes before you demo.

### Environment variables

| Where | Name | Purpose |
| --- | --- | --- |
| API | `DATABASE_URL` | Postgres connection string (required in production) |
| API | `JWT_SECRET` | Token signing key. The server refuses to start in production without it |
| API | `CORS_ORIGIN` | Allowed browser origins, comma-separated |
| API | `APP_TIMEZONE` | What "a day" means for slots. Defaults to `Africa/Lagos`, independent of the host clock |
| API | `AUTO_TOP_UP_SLOTS_DAYS` | Optional. Keeps this many days of slots created (checked at boot and every 6 hours) |
| API | `ALLOW_DESTRUCTIVE_SEED` | Only for seeding a brand-new production database: `yes` lets `npm run seed` (which wipes every table) run with `NODE_ENV=production`. Never set it on Render |
| API | `SEED_PASSWORD` | Optional. Password for the seeded demo accounts, including the admin and the Ogun/Oyo operators. Required by `seed:regions` in production |
| Web | `VITE_API_BASE_URL` | API base URL including `/api`. Baked in at build time, so redeploy after changing it |
| Web | `VITE_MAPTILER_KEY` | Optional. Map tiles, and address search when adding a station. Baked in at build time, so redeploy after changing it |
