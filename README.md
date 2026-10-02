# Contract Risk & Clause Intelligence Platform

A DBMS mini-project combining MySQL (relational data) and Qdrant (vector search)
to detect high-risk contract clauses via semantic similarity.

## Structure
- `database/` — SQL schema, seed data, ER diagram (Teammate 1)
- `vector-db/` — Qdrant setup, embedding + search scripts (Teammate 1)
- `app/` — Next.js application and API routes
- `docs/` — project documentation

## Setup
1. Copy `.env.example` to `.env.local` and fill in your MySQL password.
2. Run the SQL files in `database/schema/` in order (01, then 02) using MySQL Workbench.
3. Run `database/seed/sample_data.sql` to load test data.
4. (Later phases) Start Qdrant via `vector-db/docker-compose.yml`.
