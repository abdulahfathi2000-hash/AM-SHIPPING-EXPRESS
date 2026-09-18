# AM Shipping Express

Full-stack starter website with customer accounts, login/register, SQLite database, shipment tracking, and admin APIs.

## Run locally
1. Install Node.js 20+
2. `npm install`
3. Set a strong session secret: `SESSION_SECRET=your-secret npm start`
4. Open `http://localhost:3000`

Demo admin: `07507028898` / `123456` — change this immediately before production use.

## Production
Deploy the folder to a Node.js host. Use HTTPS, a strong `SESSION_SECRET`, persistent storage for `amshipping.db`, backups, and change the seeded admin password. For larger production use, migrate SQLite to PostgreSQL and add password reset / phone verification.
