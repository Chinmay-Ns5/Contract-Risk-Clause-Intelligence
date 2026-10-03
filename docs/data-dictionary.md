# Data Dictionary

## 1. Overview

The Contract Risk & Clause Intelligence Platform uses a relational MySQL database named `contract_risk_db`.

The database stores:

- User and role information
- Contract information
- Contract parties
- Contract clauses
- Risk categories and risk patterns
- AI-generated risk flags
- Contract obligations
- Contract deadlines

---

## 2. Tables

### 2.1 roles

Stores the different roles available in the platform.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| role_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a role |
| role_name | VARCHAR(50) | UNIQUE | No | — | Name of the user role |

---

### 2.2 users

Stores users who access and interact with the platform.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| user_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a user |
| name | VARCHAR(100) | — | No | — | User's name |
| email | VARCHAR(150) | UNIQUE | No | — | User's email address |
| password_hash | VARCHAR(255) | — | No | — | Hashed user password |
| role_id | INT | FK | Yes | NULL | References the user's role |
| created_at | TIMESTAMP | — | Yes | CURRENT_TIMESTAMP | User creation timestamp |

**Foreign Key:** `role_id → roles.role_id`

---

### 2.3 contracts

Stores uploaded contracts and their processing status.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| contract_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a contract |
| title | VARCHAR(255) | — | No | — | Contract title |
| uploaded_by | INT | FK | Yes | NULL | User who uploaded the contract |
| upload_date | TIMESTAMP | — | Yes | CURRENT_TIMESTAMP | Date and time of upload |
| file_path | VARCHAR(500) | — | Yes | NULL | Location of the uploaded contract file |
| status | ENUM | — | Yes | `pending` | Contract processing/review status |
| expiry_date | DATE | — | Yes | NULL | Contract expiry date |

**Allowed status values:** `pending`, `analyzed`, `reviewed`

**Foreign Key:** `uploaded_by → users.user_id`

---

### 2.4 parties

Stores organizations or individuals involved in contracts.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| party_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a party |
| party_name | VARCHAR(255) | — | No | — | Name of the party |
| party_type | VARCHAR(50) | — | Yes | NULL | Type/category of party |

---

### 2.5 contract_parties

Associates contracts with their participating parties.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| contract_id | INT | PK, FK | No | — | References the contract |
| party_id | INT | PK, FK | No | — | References the party |
| role_in_contract | VARCHAR(50) | — | Yes | NULL | Role of the party within the contract |

**Primary Key:** `(contract_id, party_id)`

**Foreign Keys:**
- `contract_id → contracts.contract_id`
- `party_id → parties.party_id`

Both foreign keys use `ON DELETE CASCADE`.

---

### 2.6 risk_categories

Stores categories used to classify contractual risks.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| category_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a risk category |
| category_name | VARCHAR(100) | UNIQUE | No | — | Name of the risk category |

---

### 2.7 clauses

Stores individual clauses extracted from contracts.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| clause_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a clause |
| contract_id | INT | FK | No | — | Contract containing the clause |
| clause_text | TEXT | — | No | — | Text content of the clause |
| clause_order | INT | — | Yes | NULL | Position of the clause within the contract |
| vector_id | VARCHAR(100) | — | Yes | NULL | Identifier of the clause embedding in the vector database |

**Foreign Key:** `contract_id → contracts.contract_id`

`contract_id` uses `ON DELETE CASCADE`.

---

### 2.8 risk_patterns

Stores patterns used to identify potential contractual risks.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| pattern_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a risk pattern |
| category_id | INT | FK | Yes | NULL | Risk category associated with the pattern |
| pattern_text | TEXT | — | No | — | Text representation of the risk pattern |
| vector_id | VARCHAR(100) | — | Yes | NULL | Identifier of the pattern embedding in the vector database |

**Foreign Key:** `category_id → risk_categories.category_id`

---

### 2.9 risk_flags

Stores potential risks detected by comparing contract clauses with risk patterns.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| flag_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a risk flag |
| clause_id | INT | FK | No | — | Clause associated with the detected risk |
| pattern_id | INT | FK | No | — | Risk pattern that matched the clause |
| similarity_score | DECIMAL(5,4) | — | Yes | NULL | Similarity score between the clause and risk pattern |
| category_id | INT | FK | Yes | NULL | Risk category of the detected risk |
| reviewed | BOOLEAN | — | Yes | FALSE | Indicates whether the risk flag has been reviewed |
| reviewer_id | INT | FK | Yes | NULL | User who reviewed the risk flag |
| flagged_at | TIMESTAMP | — | Yes | CURRENT_TIMESTAMP | Time when the risk was flagged |

**Foreign Keys:**
- `clause_id → clauses.clause_id`
- `pattern_id → risk_patterns.pattern_id`
- `category_id → risk_categories.category_id`
- `reviewer_id → users.user_id`

`clause_id` uses `ON DELETE CASCADE`.

---

### 2.10 obligations

Stores obligations associated with contracts.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| obligation_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for an obligation |
| contract_id | INT | FK | No | — | Contract associated with the obligation |
| description | TEXT | — | Yes | NULL | Description of the contractual obligation |
| due_date | DATE | — | Yes | NULL | Date by which the obligation is due |
| status | ENUM | — | Yes | `pending` | Current status of the obligation |

**Allowed status values:** `pending`, `completed`, `overdue`

**Foreign Key:** `contract_id → contracts.contract_id`

`contract_id` uses `ON DELETE CASCADE`.

---

### 2.11 deadlines

Stores important contract deadlines.

| Column | Data Type | Key | Nullable | Default | Description |
|---|---|---|---|---|---|
| deadline_id | INT | PK | No | AUTO_INCREMENT | Unique identifier for a deadline |
| contract_id | INT | FK | No | — | Contract associated with the deadline |
| deadline_type | VARCHAR(50) | — | Yes | NULL | Type of deadline |
| deadline_date | DATE | — | Yes | NULL | Date of the deadline |
| notified | BOOLEAN | — | Yes | FALSE | Indicates whether a notification has been sent |

**Foreign Key:** `contract_id → contracts.contract_id`

`contract_id` uses `ON DELETE CASCADE`.

---

## 3. Entity Relationships

The main relationships in the database are:

```text
roles
  |
  | 1:N
  v
users
  |
  | 1:N
  v
contracts
  |
  +--------------------+
  |                    |
  | 1:N                | N:M
  v                    v
clauses          contract_parties
  |                    |
  |                    |
  v                    v
risk_flags          parties
  |
  +----------------+
  |                |
  v                v
risk_patterns   risk_categories
contracts
   |
   +----> obligations
   |
   +----> deadlines