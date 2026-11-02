# BACKLOG.md

Deferred refactors and known gaps. Not a queue: `/plan` reads it when decomposing related work, `/backlog-audit` prunes it.

## Config gaps (locked decision 21 says polling defaults are config, not code)

- `apps/backend/src/app.ts` hard-codes the Calendar polling interval (5 min, staleness at twice that) and `businessTimeZone`
  (`America/Mexico_City`); `apps/extension/src/extension-start.ts` hard-codes the same interval, and
  `apps/extension/src/entrypoints/background.ts` the time zone. Promote all four to settings with these defaults when a second
  source (Gmail, Phase 1) needs its own interval.

## Structural

- `apps/extension/src/extension-start.ts` keeps a legacy required `now: Date` beside the optional `clock`; make `clock` the
  only time source once the integration tests stop passing `now`.
- `apps/integration` runs in the fast loop but has no `test:coverage` script, so `scripts/test.sh` does not count its tests;
  decide whether it joins the coverage floors or is counted separately.
- `packages/domain` declares its own `CalendarEvent` shape and `packages/contracts` a zod schema of the same fields; one
  should derive from the other (contracts depends on domain, so the schema should `satisfies` the domain type).

## Out of Scope

- **[apps/backend/src/startup-settings.ts:12] Default port 7777 is coupled to the extension's default backend URL** (added: 2026-11-02)
  `defaultPort` and `defaultBackendUrl` in `apps/extension/src/backend-url.ts` must change together, but nothing ties them. Deferred
  because the fix has to edit `backend-url.ts`, which is outside aa9e97f..HEAD, and no existing shared package holds plain
  constants (`packages/contracts` holds zod schemas).
- **[apps/dashboard/src/dashboard-app.tsx:43] Dashboard hard-codes the business time zone** (added: 2026-11-02)
  This is a fifth copy of `America/Mexico_City`, alongside the four in § Config gaps. Deferred to the same change: when the time
  zone becomes a setting, the dashboard should get it from `GET /now`, which changes behavior.
