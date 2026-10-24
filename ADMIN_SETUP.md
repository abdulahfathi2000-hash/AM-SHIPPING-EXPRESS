# AM Shipping Express — Admin integration

The existing homepage and PostgreSQL-backed Express server are retained.

## New
- `/admin.html`: responsive Kurdish admin interface
- `POST /api/admin/customers`: admin-only customer creation
- Existing admin shipments endpoints power listing, adding, changing status and deleting
- Print / Save as PDF invoice (browser print)

## Deploy
1. Replace your GitHub repository contents with this ZIP's contents (keep existing environment variables).
2. Set `DATABASE_URL`, `SESSION_SECRET` (long random string), `NODE_ENV=production`, and for a **fresh** database `ADMIN_INITIAL_PASSWORD` (12+ characters).
3. Deploy/redeploy the Node service on Render.
4. Sign in through the existing homepage as an admin, then open `/admin.html`.

IMPORTANT: If the admin account already exists, ADMIN_INITIAL_PASSWORD does NOT reset its password. Change any legacy default password immediately through your existing password-change flow. Do not publish credentials.

Customer creation assigns a random inaccessible password. Customers created this way cannot log in until you add a secure password invitation/reset workflow. This admin module is for staff use, not customer self-service.

Invoice currently covers ALL shipments for the selected customer, not a date-filtered subset. FX rate and fee are invoice-only inputs and not persisted. No payment ledger has been added.

This build has passed `node --check` but requires a live PostgreSQL/Render integration test before production use.
