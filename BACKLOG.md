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

## Out of Scope

- **[apps/dashboard/src/dashboard-app.tsx:32] The `GET /now` body shape is declared apart from the route that builds it** (added: 2026-11-02)
  `NowResponse` here, `{ badgeCount: number }` in `apps/extension/src/badge-refresh.ts` and the object `apps/backend/src/app.ts`
  returns must change together, and nothing ties them: a renamed field compiles and renders an empty dashboard. Deferred because
  there is no `/now` contract to unify into; adding one is new public surface in `packages/contracts`, which the project
  delivers test-first as a planned item.
- **[apps/backend/src/startup-settings.ts:12] Default port 7777 is coupled to the extension's default backend URL** (added: 2026-11-02)
  `defaultPort` and `defaultBackendUrl` in `apps/extension/src/backend-url.ts` must change together, but nothing ties them. Deferred
  because the fix has to edit `backend-url.ts`, which is outside aa9e97f..HEAD, and no existing shared package holds plain
  constants (`packages/contracts` holds zod schemas).
- **[apps/dashboard/src/dashboard-app.tsx:43] Dashboard hard-codes the business time zone** (added: 2026-11-02)
  This is a fifth copy of `America/Mexico_City`, alongside the four in § Config gaps. Deferred to the same change: when the time
  zone becomes a setting, the dashboard should get it from `GET /now`, which changes behavior.

- **All-day events show a clock time under _Later today_** (seen 2026-11-06: an all-day `Home` event rendered as `18:00 Home`, which is the UTC midnight of its date converted to Mexico City). `apps/dashboard/src/dashboard-app.tsx` formats every event's start with a time; an event with `allDay: true` should read _all day_. Behavioral; a Phase 0 follow-up fix.
