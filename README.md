# Contract Risk & Clause Intelligence Platform

A DBMS mini-project combining MySQL (relational data) and Qdrant (vector search)
to detect high-risk contract clauses via semantic similarity.

## Structure
- `database/` — SQL schema, seed data, ER diagram (Teammate 1)
- `vector-db/` — Qdrant setup, embedding + search scripts (Teammate 1)
- `app/` — Next.js application and API routes
- `docs/` — project documentation

## Setup
1. Copy `.env.example` to `.env.local`, set the MySQL connection values, and set `AUTH_SECRET` to a unique random value of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
2. Run `database/schema/01_create_tables.sql`, `database/schema/02_constraints_indexes.sql`, and `database/schema/03_views_triggers_procs.sql` in order using MySQL Workbench.
3. Run `database/seed/sample_data.sql` to load demo users, contracts, and risk patterns.
4. Start Qdrant with `docker compose -f vector-db/docker-compose.yml up -d`.
5. Run `npm install`, then `npm run dev`.

Demo sign-ins: `alice@test.com` / `AdminDemo2026!` (Admin), `bob@test.com` / `ReviewerDemo2026!` (Reviewer), and `casey@test.com` / `ViewerDemo2026!` (Viewer). Public signup creates Viewer accounts only.
# Contract-Risk-Clause-Intelligence
Contract Risk &amp; Clause Intelligence Platform using Next.js, MySQL and Vector Database
