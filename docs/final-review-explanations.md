# Final Review Explanations

This document explains how the **Contract Risk & Clause Intelligence Platform** works. It covers the architecture, the databases, the AI risk detection, the scoring formulas, roles and security, the UI, and every advanced SQL script. It ends with likely viva questions and honest limitations.

Everything here is based on the actual code in this repository. File references are given so you can open the code during the viva.

---

## Table of Contents

1. [The project in one minute](#1-the-project-in-one-minute)
2. [Technology stack and why each was chosen](#2-technology-stack-and-why-each-was-chosen)
3. [System architecture](#3-system-architecture)
4. [How the frontend and backend are connected](#4-how-the-frontend-and-backend-are-connected)
5. [Database design (MySQL)](#5-database-design-mysql)
6. [The vector database (Qdrant): what, why, how](#6-the-vector-database-qdrant-what-why-how)
7. [How risks are flagged in a contract (end-to-end)](#7-how-risks-are-flagged-in-a-contract-end-to-end)
8. [Risk scores and the formulas used](#8-risk-scores-and-the-formulas-used)
9. [User roles: how they are created and enforced](#9-user-roles-how-they-are-created-and-enforced)
10. [Authentication and security](#10-authentication-and-security)
11. [The user interface, page by page](#11-the-user-interface-page-by-page)
12. [Obligations and deadlines: what and why](#12-obligations-and-deadlines-what-and-why)
13. [Advanced SQL, explained one by one](#13-advanced-sql-explained-one-by-one)
14. [API reference](#14-api-reference)
15. [Limitations (be honest about these)](#15-limitations-be-honest-about-these)
16. [Future enhancements](#16-future-enhancements)
17. [Viva questions and model answers](#17-viva-questions-and-model-answers)

---

## 1. The project in one minute

**Problem:** Contracts are long. Risky clauses (unlimited liability, one-sided indemnity, automatic renewal, etc.) are easy to miss. The same risk can also be written in many different words, so simple keyword search fails.

**Solution:** A web application where:

1. An **Admin uploads a contract PDF**.
2. The system **extracts the text and splits it into clauses**, stored in **MySQL**.
3. Each clause is converted into a **vector embedding** (a list of 384 numbers that represents its *meaning*) and stored in **Qdrant**, a vector database.
4. Each clause vector is compared with vectors of known **risk patterns** (Liability, Indemnity, Termination, Automatic Renewal).
5. If a clause is similar enough (cosine similarity ≥ 0.35), a **risk flag** is saved in MySQL with its similarity score.
6. **Reviewers** look at the flags and mark them as reviewed. **Admins** also track **obligations** and **deadlines** for each contract.
7. **Role-based access control** (Admin / Reviewer / Viewer) decides who can do what.

**One-line pitch:** *"We combine a relational database for structured contract data with a vector database for meaning-based search, to automatically flag risky clauses in contracts."*

---

## 2. Technology stack and why each was chosen

| Layer | Technology | Why we chose it |
|---|---|---|
| Frontend | **React 19** (via Next.js), **Tailwind CSS 4** | Component-based UI. Tailwind gives fast, consistent styling. |
| Backend | **Next.js 16 App Router** route handlers (`app/api/**/route.js`) | Frontend and backend live in one project and one server. No separate Express server is needed. |
| Relational DB | **MySQL 8.4** (Docker) | Structured data with relationships, foreign keys, transactions, views, procedures, triggers. This is the DBMS core of the project. |
| DB driver | **mysql2/promise** with a **connection pool** | Async/await support, parameterized queries (prevents SQL injection), and connection reuse. |
| Vector DB | **Qdrant** (Docker) | Stores embeddings and does fast similarity search. MySQL cannot do this efficiently. |
| Embedding model | **all-MiniLM-L6-v2** via `@huggingface/transformers` (runs locally) | Small, fast, free, and private: contract text never leaves the machine. It produces 384-dimension vectors. |
| PDF parsing | **pdf-parse** (built on Mozilla pdf.js) | Extracts text from PDF files on the server. |
| Passwords | **bcryptjs** (cost factor 12) | Industry-standard slow hashing, so stolen hashes are hard to crack. |
| Sessions | Custom **HMAC-SHA256 signed cookie** (`node:crypto`) | Stateless and tamper-proof, with no extra session table. |
| Containers | **Docker Compose** | One command starts MySQL and Qdrant with the same config on any machine. |

---

## 3. System architecture

```
                        ┌──────────────────────────────────────────────┐
                        │                 BROWSER                      │
                        │  React pages ("use client"):                 │
                        │  /login /signup /dashboard / (upload)        │
                        │  /contracts /contracts/[id] /risk-review     │
                        │  /obligations                                │
                        └───────────────┬──────────────────────────────┘
                                        │ fetch('/api/...')  + cri_session cookie
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS SERVER (Node.js, port 3000)                      │
│                                                                              │
│  API route handlers (app/api/**/route.js)                                    │
│   ├─ auth/login, auth/signup, auth/logout, auth/session                      │
│   ├─ contracts (GET list, POST create/upload)                                │
│   ├─ contracts/[id] (GET detail)   contracts/[id]/analysis (POST re-analyze) │
│   ├─ risk-flags (GET)   risk-flags/[id] (PATCH mark reviewed)                │
│   ├─ obligations (GET, POST)   deadlines (GET, POST)   users (GET)           │
│                                                                              │
│  Shared libraries                                                            │
│   ├─ app/lib/auth.js            → session cookie sign/verify, hasRole()      │
│   ├─ app/lib/db.js              → MySQL connection pool                      │
│   ├─ app/lib/contract-upload.js → PDF → text → clauses                       │
│   └─ vector-db/                                                              │
│        embedding.js      → text → 384-d vector (MiniLM, local)               │
│        qdrant.js         → Qdrant client, collection, search, delete         │
│        embed_patterns.js → embeds risk patterns into Qdrant                  │
│        analyze_risk.js   → compares clauses with patterns, writes flags      │
└──────────────┬───────────────────────────────────────────┬───────────────────┘
               │ SQL (mysql2, port 3306)                   │ REST (port 6333)
               ▼                                           ▼
     ┌───────────────────────┐                  ┌────────────────────────┐
     │   MySQL 8.4 (Docker)  │                  │  Qdrant (Docker)       │
     │ users, roles,         │   linked by IDs  │ collection             │
     │ contracts, clauses,   │◀────────────────▶│ "risk_clauses"         │
     │ risk_patterns,        │  (vector_id /    │ 384-d, Cosine distance │
     │ risk_flags,           │   mysql_id)      │ points: clauses +      │
     │ obligations, ...      │                  │ risk patterns          │
     └───────────────────────┘                  └────────────────────────┘
```

**Key idea, the "two databases" design:**

- **MySQL is the source of truth.** It stores all the real records: users, contracts, clause text, flags, obligations.
- **Qdrant is a search index.** It stores only vectors plus a small payload (`mysql_id`, `type`). Each Qdrant point points back to a MySQL row.
- They are linked by IDs:
  - Clause vectors use a **random UUID point id**, stored in `clauses.vector_id` (clauses embedded before this change keep their legacy id = `clause_id`). UUIDs avoid overwriting stale vectors when MySQL reuses an auto-increment `clause_id`.
  - Pattern vectors use **point id = `10000 + pattern_id`**, and `risk_patterns.vector_id` stores that id.
  - The payload `{ mysql_id, type: 'clause' | 'pattern' }` tells us which MySQL table a point belongs to.

---

## 4. How the frontend and backend are connected

### 4.1 Next.js App Router in simple terms

- Each folder in `app/` is a URL. `app/obligations/page.jsx` becomes the page `/obligations`.
- Each `route.js` under `app/api/` is a **backend endpoint**. `app/api/obligations/route.js` exports `GET` and `POST` functions, which become `GET /api/obligations` and `POST /api/obligations`.
- The pages start with `"use client"`, so they run in the browser as React components.
- The route handlers run **only on the server**, so they can safely use the database, the file system, and secrets.

### 4.2 Request flow example: "Add obligation"

```
1. User fills the form on /obligations and clicks Submit
2. Browser (obligations/page.jsx):
     fetch('/api/obligations', { method: 'POST', body: JSON.stringify({contract_id, description, due_date}) })
     → the browser automatically attaches the httpOnly cookie "cri_session"
3. Server (app/api/obligations/route.js → POST):
     a. getSessionUser(request)  → verifies cookie signature, loads user + role from MySQL
     b. if no user              → 401 Authentication required
     c. if role ≠ admin         → 403 Admin role required
     d. validates input         → 400 if contract_id/description missing
     e. INSERT INTO obligations (...) VALUES (?, ?, ?, 'pending')   ← parameterized
     f. returns 201 + JSON of the new obligation
4. Browser receives the JSON, shows a success message, and reloads the list with GET /api/obligations
```

Every feature follows the same pattern: **page → `fetch('/api/...')` → route handler → auth check → SQL / Qdrant → JSON response → page updates its React state.**

### 4.3 Why there is no CORS or token handling in the frontend

The frontend and the API are served from the **same origin** (`localhost:3000`). The session cookie is `httpOnly`, so JavaScript cannot read it, but the browser sends it automatically with every same-origin `fetch`. This protects the token from XSS theft.

### 4.4 Where the API is called from (map)

| Page | API calls |
|---|---|
| `/login` | `POST /api/auth/login` |
| `/signup` | `POST /api/auth/signup` |
| `/dashboard` | `GET /api/auth/session`, `POST /api/auth/logout` |
| `/` (home / upload) | `GET /api/auth/session`, `GET /api/contracts`, `POST /api/contracts` (multipart PDF), `POST /api/contracts/[id]/analysis` |
| `/contracts` | `GET /api/contracts`, `GET /api/auth/session`, `POST /api/contracts` |
| `/contracts/[id]` | `GET /api/contracts/[id]`, `POST /api/contracts/[id]/analysis` |
| `/risk-review` | `GET /api/contracts`, `GET /api/contracts/[id]`, `GET /api/risk-flags?contractId=`, `PATCH /api/risk-flags/[id]` |
| `/obligations` | `GET /api/obligations`, `GET /api/contracts`, `POST /api/obligations` |

---

## 5. Database design (MySQL)

Schema file: [database/schema/01_create_tables.sql](../database/schema/01_create_tables.sql)

### 5.1 Tables

| Table | Purpose | Key columns |
|---|---|---|
| `roles` | List of roles (Admin, Reviewer, Viewer) | `role_id` PK, `role_name` UNIQUE |
| `users` | Accounts | `user_id` PK, `email` UNIQUE, `password_hash`, `role_id` FK → roles |
| `contracts` | One row per contract | `contract_id` PK, `title`, `uploaded_by` FK → users, `file_path`, `status` ENUM('pending','analyzed','reviewed'), `expiry_date` |
| `clauses` | Clauses extracted from a contract | `clause_id` PK, `contract_id` FK (CASCADE), `clause_text`, `clause_order`, `vector_id` |
| `risk_categories` | Liability, Indemnity, Termination, Automatic Renewal | `category_id` PK, `category_name` UNIQUE |
| `risk_patterns` | Example "risky" clause text per category | `pattern_id` PK, `category_id` FK, `pattern_text`, `vector_id` |
| `risk_flags` | A clause matched a risk pattern | `flag_id` PK, `clause_id` FK (CASCADE), `pattern_id` FK, `category_id` FK, `similarity_score` DECIMAL(5,4), `reviewed`, `reviewer_id` FK → users, `flagged_at` |
| `obligations` | Duties a party must perform | `obligation_id` PK, `contract_id` FK (CASCADE), `description`, `due_date`, `status` ENUM('pending','completed','overdue') |
| `deadlines` | Important dates (renewal, expiry, notice) | `deadline_id` PK, `contract_id` FK (CASCADE), `deadline_type`, `deadline_date`, `notified` |
| `parties` | Companies or people in contracts | `party_id` PK, `party_name`, `party_type` |
| `contract_parties` | **Many-to-many** link contracts ↔ parties | composite PK (`contract_id`, `party_id`), `role_in_contract` |

### 5.2 Relationships (ER summary)

```
roles 1 ──< users 1 ──< contracts 1 ──< clauses 1 ──< risk_flags >── 1 risk_patterns >── 1 risk_categories
                 │                │                        │
                 │                ├──< obligations         └── reviewer_id >── users
                 │                ├──< deadlines
                 │                └──< contract_parties >── parties      (many-to-many)
```

- **One-to-many:** a role has many users; a contract has many clauses, obligations, and deadlines.
- **Many-to-many:** contracts ↔ parties through `contract_parties`, which uses a composite primary key.
- **`risk_flags` is an associative (bridge) entity between `clauses` and `risk_patterns`.** It also carries attributes of the relationship: score, reviewed, reviewer.

### 5.3 Constraints and why they matter

- **PRIMARY KEY + AUTO_INCREMENT** on every table.
- **UNIQUE** on `users.email`, so the same email can't register twice. The app returns HTTP 409.
- **FOREIGN KEY** on every relationship gives referential integrity. You can't add an obligation to a contract that doesn't exist.
- **ON DELETE CASCADE** on `clauses`, `risk_flags`, `obligations`, `deadlines`, and `contract_parties`. Deleting a contract automatically deletes its children, so no orphan rows are left.
- **ENUM** on statuses restricts values to a fixed set.
- **NOT NULL** on required fields.
- **DEFAULT** values: `status 'pending'`, `reviewed FALSE`, `CURRENT_TIMESTAMP`.

### 5.4 Indexes

From [02_constraints_indexes.sql](../database/schema/02_constraints_indexes.sql):

```sql
CREATE INDEX idx_clauses_contract ON clauses(contract_id);      -- "get all clauses of contract X"
CREATE INDEX idx_riskflags_clause ON risk_flags(clause_id);     -- "get all flags of clause X" (joins)
CREATE INDEX idx_deadlines_date   ON deadlines(deadline_date);  -- "upcoming deadlines" ordering/range
```

They speed up the most frequent queries: joins on foreign keys, and range/sort queries on dates. InnoDB also auto-indexes primary keys, UNIQUE columns, and FK columns.

### 5.5 Normalization

The design is in **3NF**:
- Role names live only in `roles`, and users store only `role_id`.
- Category names live only in `risk_categories`.
- Clause text lives in `clauses`, not repeated inside `risk_flags`.

Every non-key attribute depends only on its table's primary key.

*Small intentional redundancy:* `risk_flags.category_id` could be derived through `pattern_id → risk_patterns.category_id`. It is stored directly for faster filtering by category, which is a common denormalization trade-off.

### 5.6 Seed data

[database/seed/sample_data.sql](../database/seed/sample_data.sql) inserts:
- 3 roles
- 3 demo users (Alice Admin, Bob Reviewer, Casey Viewer)
- 4 risk categories, with one risk pattern each
- a sample contract with parties and one clause

---

## 6. The vector database (Qdrant): what, why, how

### 6.1 What is an embedding?

An **embedding** is a list of numbers (a vector) that represents the **meaning** of a text. A neural network is trained so that texts with similar meaning produce vectors that point in similar directions.

Example:
- *"The supplier shall indemnify the customer against all claims"*
- *"Vendor agrees to hold the client harmless from any losses"*

These two sentences share almost no words, but their vectors are very close. Keyword search would miss this; vector search catches it.

### 6.2 Our model: all-MiniLM-L6-v2

File: [vector-db/embedding.js](../vector-db/embedding.js)

```js
embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await model(text, { pooling: 'mean', normalize: true });
```

- It is a **Sentence-Transformer** model: 6 transformer layers, outputting **384 dimensions**.
- It runs **locally inside Node.js**. The `@huggingface/transformers` library uses ONNX Runtime, so there is no paid API and no internet call per request (only a one-time model download). It is also private, because contract text never leaves the server.
- **`pooling: 'mean'`:** the model produces one vector per token (word piece). Mean pooling averages them into a single sentence vector.
- **`normalize: true`:** scales the vector to length 1. This makes cosine similarity equal to a simple dot product.
- The model is loaded **once** and cached in a variable (singleton), so later calls are fast.

### 6.3 Why a vector database instead of MySQL?

| Need | MySQL | Qdrant |
|---|---|---|
| Store users, contracts, relationships | ✅ Excellent | ❌ Not designed for it |
| Transactions, FK, joins | ✅ | ❌ |
| "Find the vectors most similar to this vector" | ❌ Would need to load every vector and compute math in SQL (slow, O(n)) | ✅ Built-in **HNSW index** for fast approximate nearest-neighbour search |
| Filter by metadata during search | — | ✅ Payload filters (`type = 'pattern'`) |

So we use **each database for what it is best at**. This is often called *polyglot persistence*.

### 6.4 How Qdrant is set up

File: [vector-db/qdrant.js](../vector-db/qdrant.js)

```js
await qdrant.createCollection('risk_clauses', {
  vectors: { size: 384, distance: 'Cosine' },
});
```

- **Collection** (like a table) called `risk_clauses`.
- **size: 384** must match the model's output size.
- **distance: Cosine** means similarity is measured by the angle between vectors.
- `ensureCollection()` creates the collection if it is missing (it ignores the "already exists" error) and checks that its health status is `green`.

A **point** in Qdrant = `{ id, vector, payload }`:

| Kind | id | payload |
|---|---|---|
| Clause | UUID stored in `clauses.vector_id` | `{ mysql_id: 15, contract_id: 4, type: 'clause' }` |
| Risk pattern | `10000 + pattern_id` (e.g. 10003) | `{ mysql_id: 3, type: 'pattern' }` |

The +10000 offset keeps pattern ids from colliding with clause ids inside the same collection.

### 6.5 Search

```js
qdrant.query('risk_clauses', {
  query: clauseVector,
  limit: 4,
  filter: { must: [{ key: 'type', match: { value: 'pattern' } }] },
  with_payload: true,
});
```

This means: *"Give me the 4 points most similar to this clause vector, but only points whose payload type is `pattern`."* Each result has a `score`, which is the cosine similarity, and a payload with `mysql_id`, which is the `pattern_id`.

### 6.6 Upsert and delete

- **Upsert** = insert or update. Re-embedding the same clause replaces its point instead of duplicating it, so the operation is **idempotent**.
- **Delete:** `deletePointById(id)` in `qdrant.js`. It is demonstrated safely by [vector-db/test_delete_vector.js](../vector-db/test_delete_vector.js), which inserts a test point with id `999999001`, verifies it, deletes it, and verifies the point count is back to what it was.

---

## 7. How risks are flagged in a contract (end-to-end)

### 7.1 Supported file formats: be precise

**Only PDF files with selectable text are supported.** The upload route checks for the `%PDF-` file signature, and parsing uses `pdf-parse`.

- **DOCX / Word files are not supported in the current version.** No DOCX parser is installed. Adding it would only change the text-extraction step, for example by using the `mammoth` library to turn DOCX into text. Everything after that (clause splitting, embeddings, flagging) would stay the same, because the pipeline works on plain text.
- **Scanned / image-only PDFs** are rejected with HTTP 422, because they contain no extractable text. Supporting them would need OCR (e.g. Tesseract).

### 7.2 Step-by-step pipeline

Files: [app/api/contracts/route.js](../app/api/contracts/route.js), [app/lib/contract-upload.js](../app/lib/contract-upload.js), [vector-db/analyze_risk.js](../vector-db/analyze_risk.js)

```
Admin selects PDF ─► POST /api/contracts (multipart/form-data)
 │
 ├─ 1. AUTH        : logged in? role = admin?           (else 401 / 403)
 ├─ 2. VALIDATE    : file present, not empty, ≤ 20 MB, starts with %PDF-   (400/413/415)
 ├─ 3. EXTRACT     : pdf-parse → full text
 ├─ 4. SPLIT       : text → clauses (rules below)
 ├─ 5. DEDUPLICATE : SHA-256(uploader_id + file bytes) → filename /uploads/<hash>.pdf
 │                   if the same user already uploaded this exact file → reuse that contract
 ├─ 6. SAVE (TRANSACTION):
 │        BEGIN
 │          INSERT INTO contracts (...) status='pending'
 │          INSERT INTO clauses (...) for every clause
 │        COMMIT      (ROLLBACK if anything fails → no half-saved contract)
 ├─ 7. EMBED CLAUSES  : each clause_text → 384-d vector → Qdrant upsert (id = UUID in clauses.vector_id)
 │                      UPDATE clauses SET vector_id = ...
 ├─ 8. EMBED PATTERNS : every risk_pattern → vector → Qdrant upsert (id = 10000 + pattern_id)
 ├─ 9. ANALYZE (runAnalysis):
 │        for each clause:
 │          vector = embed(clause_text)
 │          top 4 = Qdrant search, filter type='pattern'
 │          for each match:
 │             if score < 0.35            → skip
 │             if flag (clause, pattern) exists → skip (no duplicates)
 │             INSERT INTO risk_flags (clause_id, pattern_id, similarity_score, category_id)
 ├─ 10. UPDATE contracts SET status = 'analyzed'
 └─ 11. Return JSON: clauses_created, new_flags, existing_flags ...
```

### 7.3 How the text is split into clauses

File: [app/lib/contract-upload.js](../app/lib/contract-upload.js)

```js
const CLAUSE_HEADING =
  /^(?:(?:section|article|clause)\s+[A-Z0-9IVX.-]+|(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+[A-Z])/i;
```

A **new clause starts** when either:
1. there is a **blank line**, or
2. a line looks like a **clause heading**, such as `Section 4`, `Article II`, `Clause 7`, `1.`, `2.1`, `3)`, `IV.`, followed by a capital letter.

Lines in between are joined with spaces and extra whitespace is removed. Each resulting block becomes one row in `clauses`, with `clause_order` = 1, 2, 3, …

### 7.4 Why compare against "risk patterns"?

`risk_patterns` holds a **reference example of a risky clause** for each category. For example, the Liability pattern is: *"The supplier shall be liable for all direct, indirect, incidental, consequential, or special damages…"*

Detecting risk then becomes: **"How close in meaning is this clause to a known risky clause?"** Adding a new risk type needs **no code change**. You insert a new category and pattern in MySQL, and the next analysis embeds it automatically.

### 7.5 Duplicate protection (idempotency)

- **Same file uploaded twice:** detected by SHA-256 hash, so the existing contract is returned (`already_exists: true`).
- **Analysis run twice:** before inserting, the code checks `SELECT flag_id FROM risk_flags WHERE clause_id = ? AND pattern_id = ?`, so no duplicate flags are created (`existing_flags` count).
- **Vectors:** written with upsert, so there are never duplicate points.
- **Concurrent upload of the same file:** an in-memory `activeUploads` set returns HTTP 409.

### 7.6 Example (real run)

A 5-clause test PDF produced these results:

| Clause | Best category | Score | UI level |
|---|---|---|---|
| 1. Liability: "liable for all direct, indirect… damages" | Liability | 0.899 | High |
| 2. Indemnity: "indemnify and hold harmless…" | Indemnity | 0.821 | High |
| 3. Termination: "terminate immediately without cause" | Termination | 0.756 | High |
| 4. Renewal: "automatically renew…" | Automatic Renewal | 0.801 | High |
| 5. Governing law (harmless) | Indemnity | 0.393 | Low |

Each clause matched its correct category with the highest score. The harmless clause got only low scores.

---

## 8. Risk scores and the formulas used

There are **two levels of score**: one per flag (per clause-pattern pair) and one per contract.

### 8.1 Flag score: cosine similarity

Stored in `risk_flags.similarity_score`, computed by Qdrant.

$$
\text{cosine\_similarity}(A, B) = \frac{A \cdot B}{\lVert A \rVert \, \lVert B \rVert} = \frac{\sum_{i=1}^{384} A_i B_i}{\sqrt{\sum A_i^2}\,\sqrt{\sum B_i^2}}
$$

- **A** = clause vector, **B** = risk-pattern vector.
- The range is −1 to 1. In practice it is 0 to 1 for sentences: **1 = same meaning**, **0 = unrelated**.
- Because our vectors are **normalized** (length 1), the formula reduces to the **dot product** `A · B`.
- It measures the **angle** between vectors, not their length, so a long and a short clause with the same meaning still score high.

**Flagging rule** ([vector-db/analyze_risk.js](../vector-db/analyze_risk.js)):

```js
const SIMILARITY_THRESHOLD = 0.35;
if (score < SIMILARITY_THRESHOLD) skip;  else  INSERT risk_flag
```

**Risk level shown in the UI** (`getRiskLevel` in [app/risk-review/page.jsx](../app/risk-review/page.jsx)):

| Similarity score | Level |
|---|---|
| ≥ 0.75 | **High** |
| 0.50 – 0.749 | **Medium** |
| 0.35 – 0.499 | **Low** (flagged, but weak match) |
| < 0.35 | not flagged |

### 8.2 Contract score: risk density

Stored function `fn_contract_risk_score` in [10_stored_functions.sql](../database/advanced_sql/10_stored_functions.sql):

$$
\text{contract\_risk\_score} = \text{ROUND}\left(\frac{\text{number of risk flags in the contract}}{\text{number of clauses in the contract}},\ 2\right)
$$

- Unknown contract or NULL input → `NULL`
- Contract with 0 clauses → `0.00`, which avoids division by zero

The label comes from `fn_risk_level(score)`:

| Score | Label |
|---|---|
| NULL | UNKNOWN |
| 0 | NONE |
| < 1 | LOW (fewer than one flag per clause on average) |
| 1 – 1.99 | MEDIUM |
| ≥ 2 | HIGH |

**Worked example:** 5 clauses, 15 flags → 15 / 5 = **3.00 → HIGH**.

```sql
SELECT title,
       fn_contract_risk_score(contract_id)               AS risk_score,
       fn_risk_level(fn_contract_risk_score(contract_id)) AS risk_level
FROM contracts;
```

**Why "density"?** A 100-clause contract with 5 flags is less risky than a 5-clause contract with 5 flags. Dividing by the clause count normalizes for contract length.

**Honest note:** this formula counts flags equally and does not weight them by similarity score. A possible improvement is a weighted score such as `SUM(similarity_score) / clause_count`, or counting only flags ≥ 0.5.

---

## 9. User roles: how they are created and enforced

### 9.1 Where roles live

```sql
CREATE TABLE roles (
  role_id   INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE
);
-- users.role_id INT, FOREIGN KEY (role_id) REFERENCES roles(role_id)

INSERT INTO roles (role_name) VALUES ('Admin'), ('Reviewer'), ('Viewer');
```

Every user has exactly **one role** (a many-to-one relationship from users to roles).

### 9.2 Demo users (seed)

```sql
INSERT INTO users (name, email, password_hash, role_id)
SELECT 'Alice Admin', 'alice@test.com', '<bcrypt hash>', role_id
FROM roles WHERE role_name = 'Admin';
```

This uses **`INSERT … SELECT`**: the `role_id` is looked up by name instead of being hard-coded. It works even if the auto-increment ids differ.

### 9.3 New sign-ups are always "Viewer"

From [app/api/auth/signup/route.js](../app/api/auth/signup/route.js):

```sql
INSERT INTO users (name, email, password_hash, role_id)
SELECT ?, ?, ?, role_id FROM roles WHERE LOWER(role_name) = 'viewer';
```

- The role is chosen by the **server**, not by the request. Even if someone sends `"role_id": 1` in the request body, it is ignored. This prevents **privilege escalation**, and we tested it.
- The password is hashed with **bcrypt (cost 12)** before storing.
- A duplicate email triggers the UNIQUE constraint (`ER_DUP_ENTRY`), and the app returns 409.

### 9.4 How someone becomes Admin or Reviewer

There is **no UI for changing roles** (deliberately, for safety). A database administrator promotes a user with SQL:

```sql
UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Reviewer')
WHERE email = 'someone@example.com';
```

Because the role is **read from the database on every request** (see 9.5), the change takes effect immediately, with no re-login needed.

### 9.5 How a role is checked on each request

From [app/lib/auth.js](../app/lib/auth.js):

```sql
-- getSessionUser(): runs on every protected API call
SELECT u.user_id, u.name, u.email, r.role_id, r.role_name
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE u.user_id = ?;
```

```js
export function hasRole(user, allowedRoles) {
  return Boolean(user?.role_name)
    && allowedRoles.includes(String(user.role_name).trim().toLowerCase());
}
```

Each API route then does:

```js
const user = await getSessionUser(request);
if (!user)                       return 401;   // not logged in
if (!hasRole(user, ['admin']))   return 403;   // logged in, but not allowed
```

### 9.6 Permission matrix (verified by testing)

| Action | Not logged in | Viewer | Reviewer | Admin |
|---|---|---|---|---|
| View contracts, clauses, flags, obligations, deadlines | 401 | ✅ | ✅ | ✅ |
| Upload / create contract | 401 | 403 | 403 | ✅ |
| Run (re-)analysis | 401 | 403 | 403 | ✅ |
| Add obligation / deadline | 401 | 403 | 403 | ✅ |
| Mark risk flag as reviewed | 401 | 403 | ✅ | ✅ |
| List users | 401 | 403 | 403 | ✅ |

**Two layers of enforcement:**
1. **Server (real security):** every route checks the role, and the API returns 401/403.
2. **UI (user experience):** buttons and forms are hidden for roles that can't use them. For example, `isAdmin && <UploadForm/>` and `canMarkReviewed && <button>`.

The UI layer is *not* the security boundary. Even if someone un-hides a button using browser dev tools, the server still rejects the request.

### 9.7 Why these three roles?

This is the **principle of least privilege**. Each person gets only what their job needs:
- **Admin:** manages the contract lifecycle (upload, analysis, obligations, deadlines).
- **Reviewer:** a legal or compliance person who judges flags. They can't change contracts.
- **Viewer:** stakeholders who need visibility only. This is the safe default for new sign-ups.

---

## 10. Authentication and security

| Concern | How it is handled |
|---|---|
| Password storage | `bcrypt.hash(password, 12)`. It is salted and slow, and plain text is never stored. Login uses `bcrypt.compare`. |
| Password rules | At least 8 characters and at most 72 bytes (bcrypt's input limit). |
| Login errors | The same message for an unknown email and a wrong password ("Invalid email or password"), so attackers can't discover which emails exist (no **user enumeration**). |
| Session | A cookie `cri_session` = `base64url(payload).base64url(HMAC-SHA256(payload, AUTH_SECRET))`. The payload is `{ user_id, expires_at }` and the session lasts **8 hours**. |
| Tampering | The server recomputes the HMAC and compares with `timingSafeEqual` (constant time, which prevents timing attacks). If someone changes the user_id, the signature fails → 401. We tested this. |
| Cookie flags | `httpOnly` (JavaScript can't read it, which protects against XSS theft), `sameSite: 'lax'` (CSRF protection), `secure` in production (HTTPS only). |
| Role freshness | The role is not stored in the cookie. It is loaded from MySQL each request, so a demoted or deleted user loses access immediately. |
| SQL injection | All queries use **parameterized `?` placeholders** (`db.execute(sql, [values])`). User input is never concatenated into SQL. |
| File upload | Size limit 20 MB, magic-byte check for `%PDF-`, filename = SHA-256 hash (so the user's filename never touches the filesystem path, which prevents path traversal). |
| Secrets | DB password and `AUTH_SECRET` are in `.env.local`, which is git-ignored. `.env.example` documents the variables. |
| Logout | The server sets the cookie with `maxAge: 0`, which clears it. |

---

## 11. The user interface, page by page

| Page | Who sees what | What it does |
|---|---|---|
| **`/login`** | Everyone | Email and password form. On success the cookie is set and the user goes to `/dashboard`. |
| **`/signup`** | Everyone | Creates a **Viewer** account, logs the user in, and goes to `/dashboard`. |
| **`/dashboard`** | Logged-in users | Welcome message with name and role. Cards link to Contracts, Risk Review, and Obligations. Has a Logout button. Redirects to `/login` if there is no session. |
| **`/` (Home / Upload)** | Logged-in users. **Upload form: Admin only** | Summary counts (total, pending contracts), a system status panel, the contract table with status badges (Pending / Analyzed / Reviewed), an **Analyze** button (Admin only), and links to Risk Review per contract. |
| **`/contracts`** | Logged-in users. **Upload: Admin only** | List of all contracts, plus the upload form for admins. |
| **`/contracts/[id]`** | Logged-in users. **Re-analyze button: Admin only** | Contract details (ID, uploaded by, status, upload date) and **every extracted clause in order**. Link to that contract's risk review. |
| **`/risk-review`** | Logged-in users. **"Mark as Reviewed": Admin & Reviewer only** | First a list of contracts to choose from. Then for the chosen contract it shows: **summary cards** (total flags, **High-risk count (score ≥ 0.75)**, reviewed, pending) and a **flag table** (clause, category with colour badge, score, risk level, status). There are **filters** by category, risk level (High/Medium/Low), and status (Reviewed/Pending), and **sorting** by score. A **details panel** shows the full clause text next to the matched risk-pattern text, so the reviewer can compare them. |
| **`/obligations`** | Logged-in users. **Add form: Admin only** | Table of all obligations (contract, description, due date, status). Admins pick a contract from a dropdown, type a description, and choose a due date. |

Design choices worth mentioning:
- **Colour-coded categories:** Liability red, Indemnity amber, Termination blue, Automatic Renewal purple.
- **Loading, empty, and error states** are shown on every page. For example: "No contracts yet", "Unable to load contracts" with a Retry button.
- **Double-submit protection:** buttons are disabled while uploading or analyzing, and locks (`useRef`) prevent duplicate requests.
- Session data is cached in `localStorage` only for display convenience. The server cookie remains the real authority.

---

## 12. Obligations and deadlines: what and why

### 12.1 What is an obligation?

An **obligation** is something a party **must do** under the contract, usually by a date. Examples:
- "Supplier must provide a monthly compliance report", due 2026-11-24
- "Client must pay invoice within 30 days"
- "Vendor must renew insurance certificate before 31 Dec"

Table: `obligations(obligation_id, contract_id → contracts, description, due_date, status ∈ {pending, completed, overdue})`.

### 12.2 Why did we include it?

Risk in contracts is not only about **bad clauses**. It is also about **missed duties**: penalties, breach, and lost renewal windows. Finding a risky clause is half the job. The other half is **tracking what you have promised to do**. Obligations turn the system from a "risk detector" into a basic **contract management** tool.

It also shows important DBMS concepts:
- one-to-many with cascade delete
- ENUM status
- DATE handling
- obligations used in CTEs, a correlated subquery, and a UNION ALL "upcoming items" report

### 12.3 How it is used

1. An Admin opens `/obligations`, selects a contract, writes a description, picks a due date, and submits. This sends `POST /api/obligations` with status `'pending'`.
2. All logged-in users can see the list, sorted by due date (`ORDER BY due_date ASC`).
3. The **advanced SQL reports** use them:
   - Upcoming obligations and deadlines (CTE, procedure `GetContractUpcomingItems`)
   - Earliest pending obligation per contract (correlated subquery)
   - Contracts with obligations due before the next deadline (nested subquery)

### 12.4 Deadlines

`deadlines(deadline_type, deadline_date, notified)` stores **key dates** of a contract: renewal date, expiry, notice period end. The difference from obligations:

| | Obligation | Deadline |
|---|---|---|
| Meaning | A **task** someone must perform | A **date/event** in the contract's life |
| Example | "Submit monthly report" | "Renewal notice deadline: 2027-01-15" |
| Tracking field | `status` (pending/completed/overdue) | `notified` (has a reminder been sent?) |

Deadlines are available through the **API** (`GET/POST /api/deadlines`, where POST is Admin only) and used in the SQL reports. **There is no dedicated deadlines page in the UI yet.**

---

## 13. Advanced SQL, explained one by one

Folder: [database/advanced_sql/](../database/advanced_sql/). Every script is **read-only or safe**. Reports only SELECT, and the DELETE demo uses temporary tables.

### 13.1 CTE: Common Table Expressions ([01_cte_queries.sql](../database/advanced_sql/01_cte_queries.sql))

**Concept:** `WITH name AS (SELECT …)` creates a **named temporary result** that exists only for that one query. It makes complex queries readable, like defining a variable.

**Query 1: per-contract risk summary**

```sql
WITH contract_clause_risks AS (
  SELECT cl.contract_id,
         COUNT(DISTINCT cl.clause_id) AS clause_count,
         COUNT(rf.flag_id)            AS risk_flag_count,
         SUM(CASE WHEN rf.flag_id IS NOT NULL AND rf.reviewed = FALSE THEN 1 ELSE 0 END)
                                      AS unreviewed_flag_count
  FROM clauses cl
  LEFT JOIN risk_flags rf ON rf.clause_id = cl.clause_id
  GROUP BY cl.contract_id
)
SELECT c.contract_id, c.title, c.status, c.expiry_date,
       COALESCE(ccr.clause_count, 0), COALESCE(ccr.risk_flag_count, 0), COALESCE(ccr.unreviewed_flag_count, 0)
FROM contracts c
LEFT JOIN contract_clause_risks ccr ON ccr.contract_id = c.contract_id;
```

How it works:
- The CTE first aggregates clauses and flags per contract.
- **`COUNT(DISTINCT cl.clause_id)`:** a clause with 3 flags appears 3 times after the join, so DISTINCT is needed to count it once.
- **`COUNT(rf.flag_id)`:** counts only non-NULL values, so clauses without flags add 0.
- **`SUM(CASE …)`:** this is *conditional counting*. It counts only unreviewed flags.
- **`LEFT JOIN` + `COALESCE(…, 0)`:** contracts with no clauses still appear, showing 0 instead of NULL.

**Query 2: upcoming schedule using multiple CTEs + UNION ALL**

```sql
WITH upcoming_obligations AS (SELECT contract_id, 'Obligation' AS event_type, description, due_date, CAST(NULL AS UNSIGNED) AS notified
                              FROM obligations WHERE status = 'pending' AND due_date >= CURRENT_DATE),
     upcoming_deadlines   AS (SELECT contract_id, 'Deadline', deadline_type, deadline_date, notified
                              FROM deadlines WHERE deadline_date >= CURRENT_DATE),
     upcoming_events      AS (SELECT * FROM upcoming_obligations UNION ALL SELECT * FROM upcoming_deadlines)
SELECT c.title, ue.* FROM upcoming_events ue JOIN contracts c ON c.contract_id = ue.contract_id
ORDER BY ue.event_date;
```

- Three CTEs are chained, and the third uses the first two.
- **UNION ALL** stacks two result sets with the same column layout. `ALL` keeps duplicates and is faster than plain UNION, because it doesn't sort to remove them.
- `CAST(NULL AS UNSIGNED)` gives obligations a `notified` column so the column count and types match for UNION.
- `'Obligation' AS event_type` is a **literal column** that labels each row's source.

### 13.2 Nested subqueries ([02_nested_subqueries.sql](../database/advanced_sql/02_nested_subqueries.sql))

**Concept:** a query inside another query. The inner query runs **independently** of the outer one.

**Query 1: contracts flagged in above-average risk categories (4 levels deep)**

```
contracts WHERE contract_id IN
  (clauses WHERE clause_id IN
     (risk_flags WHERE category_id IN
        (categories GROUP BY … HAVING COUNT(*) >
            (SELECT AVG(cnt) FROM (SELECT COUNT(*) cnt FROM risk_flags GROUP BY category_id) AS flag_counts))))
```

Read it inside-out:
1. **Innermost derived table:** flag count per category, e.g. Liability 10, Indemnity 8, Termination 6, Renewal 4.
2. **AVG** of those counts = 7.
3. **HAVING COUNT(\*) > 7** gives the categories above average (Liability, Indemnity).
4. Flags in those categories → their clauses → their contracts.

Concepts shown: **derived table** (a subquery in FROM must have an alias), **HAVING** (a filter after GROUP BY, unlike WHERE which filters before), and **IN** with a subquery. Each contract appears once, because `IN` removes duplicates naturally.

**Query 2: pending obligations due before the next deadline**

```sql
… WHERE o.status = 'pending'
    AND o.due_date < (SELECT MIN(d.deadline_date) FROM deadlines d WHERE d.deadline_date >= CURRENT_DATE)
```

This is a **scalar subquery**, because it returns exactly one value (the nearest future deadline). If no future deadline exists, it returns NULL, and `due_date < NULL` is never true, so no rows come back. This is SQL **three-valued logic**.

### 13.3 Correlated subqueries ([03_correlated_subqueries.sql](../database/advanced_sql/03_correlated_subqueries.sql))

**Concept:** the inner query **refers to a column of the outer query's current row**, so it is (logically) re-evaluated for **every outer row**.

**Query 1: flags scoring above their own category's average**

```sql
SELECT rf.flag_id, c.title, rc.category_name, rf.similarity_score
FROM risk_flags rf JOIN clauses cl … JOIN contracts c … JOIN risk_categories rc …
WHERE rf.similarity_score > (
  SELECT AVG(rf2.similarity_score)
  FROM risk_flags rf2
  WHERE rf2.category_id = rf.category_id     -- ← correlation with outer row
    AND rf2.flag_id    <> rf.flag_id         -- ← exclude the row itself
);
```

- For each flag, we compute the average of *other* flags in the **same category** and keep the flag if it beats that average. This finds the "strongest" matches per category.
- Excluding itself (`<>`) makes the comparison fair.

**Query 2: earliest pending obligation per contract**

```sql
WHERE o.status = 'pending'
  AND o.due_date = (SELECT MIN(o2.due_date) FROM obligations o2
                    WHERE o2.contract_id = o.contract_id AND o2.status = 'pending');
```

This is the classic "**greatest/least per group**" problem: what is the next thing due on each contract? Ties (the same date) all return.

**Nested vs correlated, which examiners love to ask:**

| | Nested (non-correlated) | Correlated |
|---|---|---|
| Inner query uses outer columns? | No | Yes |
| Executed | Once | Once per outer row (logically) |
| Can run alone? | Yes | No (it references the outer alias) |
| Our example | Average of category counts | Average of *this row's* category |

### 13.4 Stored procedures ([04_stored_procedures.sql](../database/advanced_sql/04_stored_procedures.sql))

**Concept:** named, saved SQL code in the database, called with `CALL name(args)`. Benefits: reusable, less network traffic, a single place for logic, and access can be granted on the procedure.

```sql
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS GetContractRiskSummary(IN p_contract_id INT)
READS SQL DATA
SQL SECURITY INVOKER
BEGIN
  SELECT c.contract_id, c.title, c.status, c.expiry_date,
         (SELECT COUNT(*) FROM clauses cl WHERE cl.contract_id = c.contract_id) AS clause_count,
         (SELECT COUNT(*) FROM clauses cl JOIN risk_flags rf ON rf.clause_id = cl.clause_id
           WHERE cl.contract_id = c.contract_id) AS risk_flag_count,
         (SELECT COUNT(*) … AND rf.reviewed = FALSE) AS unreviewed_flag_count
  FROM contracts c WHERE c.contract_id = p_contract_id;
END$$
DELIMITER ;

CALL GetContractRiskSummary(1);
CALL GetContractUpcomingItems(1);
```

Explain each keyword:
- **`DELIMITER $$`:** the body contains `;`, so we temporarily change the statement terminator so the client doesn't end the CREATE early.
- **`IN p_contract_id`:** an input parameter. The `p_` prefix avoids clashing with column names.
- **`READS SQL DATA`:** declares that the procedure only reads and never modifies.
- **`SQL SECURITY INVOKER`:** runs with the **caller's** privileges, not the creator's, which is safer.
- **`IF NOT EXISTS`:** never overwrites an existing routine.
- Inside, it uses **scalar subqueries in the SELECT list** (each returns one count).
- `GetContractUpcomingItems` returns that contract's future pending obligations and deadlines, using **UNION ALL** and `ORDER BY` on the combined result.

### 13.5 Views ([05_views.sql](../database/advanced_sql/05_views.sql))

**Concept:** a **virtual table** defined by a saved SELECT. It stores no data itself, and each query against it runs the underlying SELECT.

```sql
CREATE VIEW review2_contract_risk_summary_v AS
SELECT c.contract_id, c.title, c.status, c.expiry_date,
       COUNT(DISTINCT cl.clause_id) AS clause_count,
       COUNT(rf.flag_id)            AS risk_flag_count,
       SUM(CASE WHEN rf.flag_id IS NOT NULL AND rf.reviewed = FALSE THEN 1 ELSE 0 END) AS unreviewed_flag_count
FROM contracts c
LEFT JOIN clauses cl    ON cl.contract_id = c.contract_id
LEFT JOIN risk_flags rf ON rf.clause_id   = cl.clause_id
GROUP BY c.contract_id, c.title, c.status, c.expiry_date;

SELECT * FROM review2_contract_risk_summary_v;
```

Why use views:
- **Simplicity:** a complex join becomes `SELECT * FROM view`.
- **Security:** you can grant access to the view but not the base tables, for example to hide `password_hash`.
- **Consistency:** everyone uses the same definition of "risk summary".

This view is **not updatable**, because it uses GROUP BY and aggregates. A view is read-only when it contains aggregates, DISTINCT, GROUP BY, or UNION.

### 13.6 Transactions ([07_transactions.sql](../database/advanced_sql/07_transactions.sql))

**Concept:** a group of statements treated as **one unit**, following the **ACID** properties:

| Property | Meaning | In our project |
|---|---|---|
| **A**tomicity | All or nothing | Contract + all clauses saved together, or none |
| **C**onsistency | DB moves from one valid state to another | FKs and constraints are always respected |
| **I**solation | Concurrent transactions don't interfere | REPEATABLE READ snapshot |
| **D**urability | Committed data survives crashes | InnoDB redo log |

**SQL script (read-only consistent reporting):**

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT … contract summary …;
  SELECT … upcoming obligations and deadlines …;
COMMIT;
```

Both reports see the **same snapshot** of the data. If someone inserts a flag between the two SELECTs, neither report sees it, so the reports never contradict each other. This is **MVCC** (Multi-Version Concurrency Control) in InnoDB. `READ ONLY` lets InnoDB optimize, and it blocks accidental writes.

**Real transaction in the application** (the PDF upload in [app/api/contracts/route.js](../app/api/contracts/route.js)):

```js
await connection.beginTransaction();
  INSERT INTO contracts (...);
  for each clause: INSERT INTO clauses (...);
await connection.commit();
// on any error:
await connection.rollback();   // no contract without its clauses
```

**Isolation levels** to know: READ UNCOMMITTED (dirty reads possible) < READ COMMITTED < **REPEATABLE READ (MySQL default)** < SERIALIZABLE.

### 13.7 DML DELETE demo ([08_dml_delete_demo.sql](../database/advanced_sql/08_dml_delete_demo.sql))

**Concept:** shows `DELETE` safely, **without touching real data**.

1. Counts the real tables **BEFORE**.
2. Creates a **TEMPORARY TABLE** `demo_delete_flags`. It is visible only in this session and dropped automatically on disconnect.
3. Inserts 4 demo rows.
4. **Simple delete:** `DELETE FROM demo_delete_flags WHERE demo_flag_id = 1;`
5. **Delete with a subquery:**
   ```sql
   DELETE FROM demo_delete_flags
   WHERE reviewed = TRUE AND clause_ref IN (SELECT clause_ref FROM demo_obsolete_clauses);
   ```
   A second temporary table is used because MySQL can't reference the same temporary table twice in one statement.
6. Drops the temporary tables and counts the real tables **AFTER**. The counts are identical, which proves nothing real changed.

Also mention: **DELETE vs TRUNCATE vs DROP**:
- DELETE removes chosen rows, can be rolled back, and fires triggers.
- TRUNCATE removes all rows quickly and resets AUTO_INCREMENT.
- DROP removes the table itself.

In the real schema, deleting a contract **cascades** to clauses → risk_flags, obligations, and deadlines.

### 13.8 Recursive CTE ([09_recursive_cte.sql](../database/advanced_sql/09_recursive_cte.sql))

**Concept:** `WITH RECURSIVE` has two parts:
- an **anchor member** (the starting rows)
- a **recursive member** that refers to the CTE itself, repeated until it produces no new rows

They are joined with `UNION ALL`.

Our schema has no parent-child table, so recursion is applied to **natural sequences**.

**Query 1: walk clauses in order with a running total of flags**

```sql
WITH RECURSIVE clause_flags AS (…flags per clause…),
clause_chain AS (
  -- anchor: first clause of each contract
  SELECT contract_id, clause_id, clause_order, flag_count, flag_count AS cumulative_flags
  FROM clause_flags cf
  WHERE clause_order = (SELECT MIN(clause_order) FROM clauses x WHERE x.contract_id = cf.contract_id)
  UNION ALL
  -- recursive: next clause (order + 1), add its flags to the running total
  SELECT cf.contract_id, cf.clause_id, cf.clause_order, cf.flag_count, ch.cumulative_flags + cf.flag_count
  FROM clause_chain ch
  JOIN clause_flags cf ON cf.contract_id = ch.contract_id AND cf.clause_order = ch.clause_order + 1
)
SELECT … ORDER BY contract_id, clause_order;
```

The output is a running total, and the last clause's value equals the contract's total flags. The recursion stops when no clause with `order + 1` exists.

**Query 2: monthly review checkpoints (date series)**

```sql
WITH RECURSIVE review_checkpoints AS (
  SELECT 1 AS checkpoint_no, DATE('2027-01-15') AS checkpoint_date
  UNION ALL
  SELECT checkpoint_no + 1, DATE_ADD(checkpoint_date, INTERVAL 1 MONTH)
  FROM review_checkpoints
  WHERE DATE_ADD(checkpoint_date, INTERVAL 1 MONTH) <= DATE('2027-07-15')
)
SELECT * FROM review_checkpoints;   -- 7 rows: Jan 15 … Jul 15
```

The `WHERE` condition is the **termination condition**. Without it, the recursion would continue until MySQL's `cte_max_recursion_depth` limit (default 1000) stops it with an error.

### 13.9 Stored functions ([10_stored_functions.sql](../database/advanced_sql/10_stored_functions.sql))

**Concept:** like a procedure, but it **returns one value** and can be used **inside SQL expressions** (`SELECT fn(x)`, `WHERE fn(x) > 1`).

- `fn_contract_risk_score(p_contract_id)` → `DECIMAL(8,2)` = flags ÷ clauses (see §8.2).
  - Uses `DECLARE` local variables, `SELECT … INTO` variables, `IF … THEN RETURN`, and `NOT EXISTS`.
  - `READS SQL DATA`.
- `fn_risk_level(p_score)` → `'UNKNOWN' | 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'`.
  - Marked **`DETERMINISTIC`** (same input always gives the same output) and **`NO SQL`** (doesn't read tables).

| | Procedure | Function |
|---|---|---|
| Called with | `CALL p()` | inside an expression: `SELECT f()` |
| Returns | 0..n result sets / OUT params | exactly one value |
| Use in SELECT/WHERE | ❌ | ✅ |
| Our examples | `GetContractRiskSummary`, `GetContractUpcomingItems` | `fn_contract_risk_score`, `fn_risk_level` |

### 13.10 Trigger ([11_triggers.sql](../database/advanced_sql/11_triggers.sql))

**Concept:** code that runs **automatically** when a row is inserted, updated, or deleted. It enforces rules **inside the database**, so the rules hold even if someone bypasses the app and edits the data directly.

```sql
CREATE TRIGGER IF NOT EXISTS trg_risk_flags_review_guard
BEFORE UPDATE ON risk_flags
FOR EACH ROW
BEGIN
  IF COALESCE(NEW.reviewed, 0) = 1 AND NEW.reviewer_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A risk flag cannot be marked reviewed without a reviewer_id.';
  END IF;
  IF COALESCE(OLD.reviewed, 0) = 1 AND COALESCE(NEW.reviewed, 0) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A reviewed risk flag cannot be reverted to unreviewed.';
  END IF;
END$$
```

- **`BEFORE UPDATE`:** runs before the change is written, so it can **block** it.
- **`FOR EACH ROW`:** a row-level trigger.
- **`OLD` / `NEW`:** the row's values before and after the update.
- **`SIGNAL SQLSTATE '45000'`:** raises a custom error. The UPDATE fails, and inside a transaction it can be rolled back.
- **Business rules enforced:**
  1. Every review must record **who** reviewed it (accountability / audit trail).
  2. A review **can't be undone**, so flags can't be silently un-reviewed.
- The app layer enforces the same rules: the PATCH route accepts only `{ "reviewed": true }` and always sets `reviewer_id`. This is **defence in depth**.

### 13.11 Joins used across the project

| Join | Where | Why |
|---|---|---|
| `INNER JOIN` | `users ⋈ roles` in login/session; `obligations ⋈ contracts` | Only matching rows are needed |
| `LEFT JOIN` | Summary view/CTE: `contracts ⟕ clauses ⟕ risk_flags`; risk-flags API: `⟕ risk_categories`, `⟕ users (reviewer)` | Keep contracts with no clauses or flags, and flags with no reviewer yet |
| Multi-table (5 tables) | `GET /api/risk-flags` joins risk_flags, clauses, contracts, risk_categories, risk_patterns, users | Show everything about a flag in one row |

---

## 14. API reference

| Method & path | Auth | Purpose | Main SQL |
|---|---|---|---|
| `POST /api/auth/signup` | Public | Create a Viewer account and log in | `INSERT … SELECT role_id FROM roles` |
| `POST /api/auth/login` | Public | Verify password, set cookie | `SELECT … FROM users JOIN roles` |
| `POST /api/auth/logout` | Any | Clear cookie | — |
| `GET /api/auth/session` | Logged in | Current user + role | `SELECT … JOIN roles` |
| `GET /api/contracts` | Logged in | List contracts | `SELECT * FROM contracts ORDER BY upload_date DESC` |
| `POST /api/contracts` | **Admin** | JSON: create record. Multipart: upload PDF + full analysis | transaction INSERTs |
| `GET /api/contracts/[id]` | Logged in | Contract + clauses | 2 SELECTs |
| `POST /api/contracts/[id]/analysis` | **Admin** | Re-embed patterns, re-run analysis | INSERT risk_flags, UPDATE status |
| `GET /api/risk-flags?contractId=&category=` | Logged in | Flags with all details | 6-table JOIN, dynamic WHERE |
| `PATCH /api/risk-flags/[id]` | **Admin / Reviewer** | Mark reviewed (body must be exactly `{"reviewed": true}`) | `UPDATE risk_flags SET reviewed = TRUE, reviewer_id = ?` |
| `GET /api/obligations` | Logged in | List obligations | JOIN contracts |
| `POST /api/obligations` | **Admin** | Add obligation | INSERT |
| `GET /api/deadlines` | Logged in | List deadlines | JOIN contracts |
| `POST /api/deadlines` | **Admin** | Add deadline | INSERT |
| `GET /api/users` | **Admin** | List user ids and names | SELECT |

Status codes used:
- `200` OK
- `201` Created
- `400` Bad input
- `401` Not logged in
- `403` Wrong role
- `404` Not found
- `409` Duplicate / in progress
- `413` Too large
- `415` Not a PDF
- `422` No text in PDF
- `500` Server error

---

## 15. Limitations (be honest about these)

Examiners respect honesty. These are real and known:

1. **PDF only.** No DOCX or scanned-image (OCR) support yet.
2. **Clause splitting is rule-based** (headings and blank lines). Unusual formatting can merge or split clauses incorrectly.
3. **Low threshold (0.35)** means some harmless clauses get *Low* flags (false positives). The UI's High/Medium/Low levels help reviewers prioritise.
4. **Only 4 risk patterns** (one per category). Accuracy improves with more patterns per category.
5. **Risk detection is assistive, not legal advice.** A human reviewer makes the final decision.
6. **Contract risk score** counts flags equally and doesn't weight them by similarity.
7. **No UI** for deadlines, changing roles, marking obligations completed, or deleting/editing contracts. Obligation status `overdue` and contract status `reviewed` exist in the schema but aren't set automatically.
8. **`parties` / `contract_parties`** exist in the schema and seed data but aren't used by the app yet.
9. Pages load for anyone and redirect client-side. Data is protected by the API checks, but there is no server-side page guard (middleware).
10. Qdrant point ids: clause ids and `10000 + pattern_id` could collide once clause ids reach 10001+. A separate collection, or UUIDs, would fix this.

---

## 16. Future enhancements

- DOCX support (`mammoth`) and OCR for scanned PDFs (Tesseract).
- More risk categories and multiple patterns per category (e.g. confidentiality, penalty, IP ownership, non-compete).
- An LLM-generated **explanation** of why a clause is risky, and a suggested safer wording (RAG over the patterns).
- Automatic obligation/deadline **extraction** from clause text, plus email reminders (using `notified`).
- A scheduled job (MySQL EVENT or cron) to mark obligations `overdue` when `due_date < CURRENT_DATE`.
- Weighted contract risk score and a risk dashboard with charts.
- An admin UI for user/role management, plus an audit log table.
- Server-side route protection (Next.js middleware / proxy).

---

## 17. Viva questions and model answers

### Project and architecture

**Q: Explain your project in two sentences.**
A: It is a contract management system that automatically flags risky clauses. It splits uploaded PDFs into clauses, converts them into meaning-vectors, and compares them with known risky clause patterns using a vector database. MySQL stores all structured data (users, contracts, flags, obligations), and role-based access control decides who can upload, review, or only view.

**Q: Why two databases?**
A: MySQL is best for structured, related data with integrity (FKs, transactions, joins). Qdrant is best for similarity search over high-dimensional vectors, using an HNSW index. MySQL can't efficiently answer "which stored vectors are closest to this one?". Each database does what it is good at, and they are linked by IDs (`vector_id` / `mysql_id`).

**Q: What happens if Qdrant is down?**
A: Login and viewing contracts, obligations, and existing flags still work, because they come from MySQL. Upload and analysis fail with an error. The contract and clauses are saved first (in a committed transaction), so no data is lost, and analysis can be re-run later from the Re-analyze button.

**Q: Where is the backend?**
A: Inside the same Next.js project. Files named `route.js` under `app/api/` are server-side HTTP handlers (GET/POST/PATCH). The React pages call them with `fetch('/api/...')`.

**Q: How does the frontend know who is logged in?**
A: It calls `GET /api/auth/session`. The server reads the signed `cri_session` cookie, verifies it, and returns the user with their role. The page then shows or hides admin and reviewer controls.

### Vector DB and AI

**Q: What is an embedding? What dimension?**
A: A numeric vector representing the meaning of text. We use all-MiniLM-L6-v2, which gives 384 dimensions, with mean pooling and normalization.

**Q: Why cosine similarity and not Euclidean distance?**
A: Cosine compares direction (meaning) regardless of vector length, so clause length doesn't affect the score. With normalized vectors, cosine is just the dot product and ranks results the same way as Euclidean distance.

**Q: What is HNSW?**
A: Hierarchical Navigable Small World. It is a graph-based index Qdrant uses for **approximate nearest-neighbour** search. It finds the closest vectors in roughly logarithmic time instead of comparing with every vector.

**Q: Is this RAG?**
A: It uses the **retrieval** part of RAG. We retrieve the most similar known risk patterns for each clause. We don't currently use an LLM to *generate* text, so it is semantic retrieval / classification. Adding LLM explanations would make it full RAG.

**Q: Why run the model locally instead of using OpenAI?**
A: It is free, works offline after the first download, is fast enough for a small model, and keeps confidential contract text private.

**Q: Why the threshold 0.35?**
A: It was chosen during testing to catch paraphrased risky clauses while ignoring unrelated text. It is deliberately sensitive (favouring recall). The UI then separates High (≥ 0.75) from Medium and Low, so reviewers focus on the strongest matches first. It is a tunable constant in `analyze_risk.js`.

**Q: How do you add a new risk type?**
A: Insert a row in `risk_categories` and a pattern in `risk_patterns`. The next analysis automatically embeds the pattern into Qdrant. No code change is needed.

### DBMS concepts

**Q: Difference between WHERE and HAVING?**
A: WHERE filters rows before grouping. HAVING filters groups after GROUP BY, and can use aggregates like `COUNT(*) > …`. See nested query 1.

**Q: Difference between a nested and a correlated subquery?**
A: A nested subquery is independent and runs once. A correlated subquery references the outer row (e.g. `rf2.category_id = rf.category_id`) and is evaluated per outer row. See §13.3.

**Q: Why `COUNT(DISTINCT clause_id)` in the summary?**
A: The LEFT JOIN to risk_flags repeats a clause once per flag. DISTINCT counts each clause once.

**Q: Procedure vs function?**
A: A function returns a single value and can be used in SELECT/WHERE. A procedure is called with CALL and can return result sets.

**Q: Procedure vs view?**
A: A view is a saved query used like a table, with no parameters. A procedure can take parameters (like `p_contract_id`) and contain logic.

**Q: What does your trigger do and why BEFORE, not AFTER?**
A: It blocks marking a flag reviewed without a reviewer, and blocks un-reviewing. BEFORE is needed so we can reject the change before it is written. An AFTER trigger would be too late to prevent it.

**Q: Where do you use transactions in the app?**
A: In the PDF upload, where the contract row and all its clause rows are inserted inside `beginTransaction / commit`, with `rollback` on error. This gives atomicity, so there is never a contract with missing clauses.

**Q: What is the default isolation level in MySQL and what does it prevent?**
A: REPEATABLE READ. It prevents dirty reads and non-repeatable reads. InnoDB's MVCC snapshot plus next-key locks also largely prevent phantom reads.

**Q: What is ON DELETE CASCADE? Where is it used?**
A: When a parent row is deleted, its child rows are deleted automatically. Deleting a contract removes its clauses (and through them, risk_flags), obligations, deadlines, and contract_parties.

**Q: Which normal form is your database in?**
A: 3NF. There are no repeating groups (1NF), no partial dependencies (2NF), and no transitive dependencies (3NF): role names, category names, and contract data each live in their own table. `risk_flags.category_id` is a deliberate small denormalization for faster category filtering.

**Q: Is there a many-to-many relationship?**
A: Yes, contracts ↔ parties through the `contract_parties` junction table, with a composite primary key `(contract_id, party_id)` and an extra attribute `role_in_contract`. `risk_flags` is also effectively an associative entity between clauses and risk patterns.

**Q: Why use indexes on those three columns?**
A: They are the most frequent join and filter columns: clauses by contract, flags by clause, and deadlines by date (range and sort). Indexes turn full table scans into B-tree lookups.

**Q: How do you prevent SQL injection?**
A: Every query uses parameterized placeholders (`?`) with `db.execute(sql, values)`. Input is sent separately from the SQL text and is never concatenated.

**Q: What is a recursive CTE? Where is the stopping condition?**
A: A CTE that references itself. It has an anchor (the starting rows) and a recursive part, joined with UNION ALL. It stops when the recursive part returns no rows. In the date example, that is the `WHERE DATE_ADD(...) <= '2027-07-15'` condition; in the clause example, it is when no clause with `order + 1` exists.

**Q: UNION vs UNION ALL?**
A: UNION removes duplicates (extra sort/hash cost). UNION ALL keeps all rows and is faster. We use UNION ALL because obligations and deadlines are different events and should all appear.

### Roles and security

**Q: How are roles implemented?**
A: A `roles` table plus a `role_id` foreign key in `users`. On every API request we verify the session cookie, then load the user's role with `users JOIN roles`. The route allows or denies the action with `hasRole()` and returns 401 if not logged in or 403 if the role isn't allowed.

**Q: Can a user make themselves admin during signup?**
A: No. Signup always selects the Viewer role on the server with `INSERT … SELECT role_id FROM roles WHERE role_name = 'viewer'`, and any role in the request body is ignored. We tested this.

**Q: How is an admin created?**
A: Through seed data, or by a database administrator running `UPDATE users SET role_id = (SELECT role_id FROM roles WHERE role_name='Admin') WHERE email = …`.

**Q: If I hide the button, isn't that enough?**
A: No. Hiding is only for user experience. The real check is on the server, which returns 403 for wrong roles even if a request is sent directly with curl or Postman.

**Q: How is the password stored?**
A: As a bcrypt hash with cost 12, which is salted and slow to brute-force. The plain password is never stored or logged.

**Q: How do you stop someone editing their cookie to become another user?**
A: The cookie contains the payload plus an HMAC-SHA256 signature made with a server secret. Any change breaks the signature, and the server rejects it, comparing in constant time with `timingSafeEqual`.

### UI and features

**Q: What is an obligation and why is it in a risk system?**
A: An obligation is a duty with a due date (e.g. "submit monthly compliance report by the 24th"). Missing obligations causes penalties and breach, which is a form of contract risk, so tracking them complements clause-risk detection.

**Q: What is the difference between an obligation and a deadline?**
A: An obligation is a task with a status (pending, completed, overdue). A deadline is a key contract date (renewal, expiry) with a `notified` flag for reminders.

**Q: What does the reviewer actually do?**
A: Opens Risk Review and picks a contract. They filter by High risk or a category, open a flag to compare the clause text with the matched risk pattern, and click *Mark as Reviewed*. The database records who reviewed it, and the trigger guarantees that the review can't be undone or left anonymous.

**Q: What do the contract statuses mean?**
A: `pending` means uploaded but not analyzed yet. `analyzed` means risk analysis has finished and flags exist. `reviewed` is reserved for when all flags are reviewed; it is in the schema but not yet set automatically.

---

*Quick demo order for the viva:*
1. Log in as Admin.
2. Upload a PDF and show the clause count and flags.
3. Open Risk Review: show the High-risk count, filters, and the details panel.
4. Log in as Reviewer and mark a flag reviewed.
5. Log in as Viewer and show that buttons are hidden. Show a 403 by calling the API directly.
6. Add an obligation as Admin.
7. In MySQL, run `CALL GetContractRiskSummary(id)` and `SELECT fn_risk_level(fn_contract_risk_score(id))`, then show the trigger blocking `UPDATE risk_flags SET reviewed = FALSE`.
