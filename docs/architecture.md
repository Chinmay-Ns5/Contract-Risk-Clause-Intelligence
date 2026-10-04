# System Architecture

## 1. Project Overview

The Contract Risk & Clause Intelligence Platform is a web-based system for storing contracts, extracting clauses, identifying potential contractual risks, and supporting semantic clause and risk analysis.

The system uses:

- Next.js for the web application and API layer
- MySQL for relational data storage
- Qdrant for vector storage and similarity search
- Local sentence embeddings using `Xenova/all-MiniLM-L6-v2`
- Node.js scripts for embedding and risk analysis

---

## 2. High-Level Architecture

The system consists of four major layers:

1. Frontend / Web Application
2. Backend / API Layer
3. Relational Database
4. Vector Database and Risk Analysis Layer

### Architecture Flow

```text
User
  |
  v
Next.js Web Application
  |
  v
Next.js API Routes
  |
  +----------------------+
  |                      |
  v                      v
MySQL                  Qdrant
(Relational DB)        (Vector DB)
  |                      |
  |                      v
  |               Semantic Similarity
  |                      |
  |                      v
  |                Risk Analysis
  |                      |
  +----------<-----------+
             |
             v
       Risk Flags / Results

---

## 3. MySQL Database

The relational database is named:

`contract_risk_db`

The database contains 11 main tables:

- `roles`
- `users`
- `contracts`
- `parties`
- `contract_parties`
- `risk_categories`
- `clauses`
- `risk_patterns`
- `risk_flags`
- `obligations`
- `deadlines`

MySQL is responsible for structured application data, relationships, constraints, risk records, contract information, obligations, and deadlines.

Primary keys and foreign keys are used to maintain relationships between the entities.

---

## 4. Vector Database

Qdrant is used for semantic similarity search.

Qdrant runs locally using Docker.

The embedding model used by the project is:

`Xenova/all-MiniLM-L6-v2`

The model generates 384-dimensional embeddings.

Cosine similarity is used to compare vectors.

The vector database stores embeddings for:

- Contract clauses
- Risk patterns

The Qdrant payload identifies whether a vector represents a clause or a risk pattern.

---

## 5. Clause Embedding Workflow

When clauses are available in MySQL, the embedding script:

1. Retrieves clauses from MySQL.
2. Generates an embedding for each clause.
3. Stores the embedding in Qdrant.
4. Stores the corresponding Qdrant vector ID back in MySQL.

The main script responsible for this workflow is:

`vector-db/embed.js`

Risk patterns are embedded separately using:

`vector-db/embed_patterns.js`

---

## 6. Risk Analysis Workflow

The main risk-analysis logic is implemented in:

`vector-db/analyze_risk.js`

The workflow is:

1. Retrieve contract clauses.
2. Generate an embedding for the clause.
3. Search Qdrant for similar risk patterns.
4. Restrict the search to vectors identified as risk patterns.
5. Calculate semantic similarity.
6. Compare the similarity score against the configured threshold.
7. Create a record in `risk_flags` when a match meets the threshold.

The current similarity threshold is:

`0.35`

The system currently contains risk patterns for:

- Liability
- Indemnity
- Termination
- Automatic Renewal
---

## 7. Backend API Layer

The application uses Next.js App Router API routes.

Implemented API functionality includes:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/contracts` | GET | Retrieve contracts |
| `/api/contracts` | POST | Create a contract / process contract upload |
| `/api/contracts/[id]` | GET | Retrieve a specific contract |
| `/api/contracts/[id]/analysis` | POST | Trigger contract analysis |
| `/api/risk-flags` | GET | Retrieve risk flags |
| `/api/risk-flags/[id]` | PATCH | Mark a risk flag as reviewed |
| `/api/users` | GET | Retrieve users |

The backend communicates with MySQL through the database helper in:

`app/lib/db.js`

---

## 8. Risk Review Workflow

The Risk Review page is implemented at:

`app/risk-review/page.jsx`

The page:

1. Requests risk flags from the backend.
2. Displays the detected risk flags.
3. Allows filtering by risk category.
4. Displays category-specific visual indicators.
5. Allows a risk flag to be marked as reviewed.
6. Sends the review update to the backend through the risk-flag API.

---

## 9. Database Integration

The backend uses MySQL through the `mysql2/promise` package.

Database configuration is read from `.env.local`.

The database layer is responsible for:

- Contract storage
- Clause storage
- Risk categories
- Risk patterns
- Risk flags
- Obligations
- Deadlines
- User and role information

---

## 10. Database Advanced Features

The project implements four advanced DBMS features:

### Transactions

Transactions are used to demonstrate controlled commit and rollback behaviour.

### Views

The project includes the:

`clause_risk_overview`

view for combining clause and risk information.

### Triggers

The:

`after_riskflag_insert`

trigger updates the corresponding contract status to `analyzed` when a risk flag is inserted.

### Indexing

Indexes have been added to improve query performance for frequently accessed database fields.
---

## 11. Deployment / Local Development

The project is intended to run in a local development environment.

The main components are:

```text
Next.js Application
       |
       +---- MySQL
       |
       +---- Qdrant
                |
                +---- Docker