# Supabase operational health checks

This is a small server-side database check for Aurora’s Cake. When enabled, the Cloudflare Worker attempts **four database calls per UTC day**, one at a changing time inside each six-hour window. The other scheduled ticks return `not_due` without contacting Supabase. It works when no customer has the website open.

Supabase says Free projects with low activity over seven days may be paused and a few requests to the database each day should generally be sufficient. This check does **not guarantee** that a Free project will stay active. Network failures, missed scheduler events, account limits, provider policy changes, or an already paused project can prevent success. For an uptime requirement, use the appropriate paid plan. See [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## Stored data and permissions

Migration `20261030_005_operational_health.sql` creates a private `aurora_monitoring.app_health` singleton. It updates only the last six-hour slot, check time, random request UUID, and total check counter. It creates no fake customers, orders, products, messages, or marketing subscriptions.

The private schema and table have no browser-role access. Row Level Security is enabled. The `public.aurora_operational_heartbeat` function uses an empty `search_path` and grants execution only to `service_role`. Its update condition is atomic: repeated or older slots cannot overwrite a newer slot or increment the counter. Invalid, future, and more than 24-hour-old slots are rejected. The worker rejects delayed scheduler events older than 30 minutes before making a request.

## Configuration

Apply the migration as the database schema owner, then set the following Worker configuration:

| Setting | Value | Location |
| --- | --- | --- |
| `SUPABASE_URL` | `https://dtvefwpaxwffxglqbfoo.supabase.co` | Worker variable |
| `SUPABASE_SERVER_KEY` | Supabase secret key or legacy `service_role` JWT | Encrypted Worker secret |
| `SUPABASE_HEALTH_ENABLED` | `true` after setup and verification | Worker variable |

The flag defaults to disabled and only the exact string `true` enables it. The URL must be a clean HTTPS Supabase project root, with no credentials, query, fragment, or extra path. Do not put the server key in a `VITE_` variable, browser code, URL, source control, logs, or chat.

New `sb_secret_...` keys are sent in `apikey` only because they are not JWTs. Legacy `service_role` JWTs are sent in both `apikey` and `Authorization: Bearer`. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) and [migration to new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Worker wiring

The module exports `runSupabaseScheduledHealth(event, env)` and the safe `supabaseHealthConfiguration(env)` diagnostic. The diagnostic returns only `enabled`, `configured`, and a fixed status code; it never returns URL or key contents.

`cloudflare/supabaseHealthStatus.js` exports `supabaseHealthStatusHandler` for a `GET /api/supabase-health` route. It reports configuration only, never contacts the database, and does not claim the database is healthy. Other HTTP methods return `405`.

The Worker entry point must register:

```js
import { runSupabaseScheduledHealth } from './supabaseHealth.js';

export default {
  // Existing fetch handler remains here.
  scheduled(event, env, ctx) {
    ctx.waitUntil(runSupabaseScheduledHealth(event, env));
  },
};
```

The Wrangler schedule is:

```toml
[triggers]
crons = ["7,22,37,52 * * * *"]
```

Every 15-minute cron tick is local scheduling work. A SHA-256 hash of the project hostname, UTC date, and six-hour window selects one of the window’s 24 quarter-hours. The clock offset is seven minutes, so the selected event is one of the configured cron ticks. `event.scheduledTime` determines the slot even if execution starts slightly late. There are no long waits and no visitor timers.

Each selected tick makes one HTTPS POST with an eight-second timeout and no retry queue. Duplicate scheduler delivery can produce an additional request, but the database counter changes only once for that six-hour slot. No errors or upstream response bodies are logged by the module. The normal four-call budget assumes Cloudflare delivers each scheduled event; this is an operational check, not a delivery guarantee.

## Verification and stopping

Run `node --import tsx --test tests/supabase-health.test.ts` for the isolated tests. They cover disabled configuration, validation, seven days of scheduling, request headers/body, stale events, timeout, failures, and the SQL permission/idempotency structure. SQL structure tests do not replace applying and checking the migration against a real Supabase project.

For actual PostgreSQL-compatible execution without touching a live project, install `@electric-sql/pglite` in a disposable directory outside this repository, then run `node scripts/verify-supabase-health.mjs <runtime-directory>`. The runtime directory must contain its `node_modules`. This optional script creates an in-memory database, applies the migration twice, exercises the Dashboard verification, checks invalid inputs, and proves all verification writes rolled back. It does not add a production dependency or test a live project's API gateway.

After migration, run the entire owner-only Dashboard SQL script `supabase/00-health-verification.sql`. It verifies actual browser-role denials, owner and service-role access, duplicate-slot idempotency, monotonic updates, and future-slot rejection. Its isolated health fixture is enclosed in a transaction ending in `ROLLBACK`, which restores the original singleton contents. Keep that final statement; if the SQL editor stops on an error, run `ROLLBACK;` before retrying. It never touches business tables.

After configuration and a real scheduled event, inspect in an owner-only SQL session:

```sql
select last_slot, checked_at, check_count
from aurora_monitoring.app_health
where id = 1;
```

Set `SUPABASE_HEALTH_ENABLED` to `false` to stop requests immediately; removing the cron also stops scheduled invocations. Never expose the verification script or owner SQL access through a public web endpoint.
