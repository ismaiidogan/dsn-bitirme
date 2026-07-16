# DSN — Distributed Storage Network

> Production-grade distributed file storage platform with zero-trust encryption, self-healing replication, and multi-language architecture.
> 
> 🌐 **Live at:** [storemyfile.com](https://storemyfile.com)

---

## Overview

DSN is a graduation project built as a fully functional, production-deployed distributed file storage system. The platform allows users to store and retrieve files securely across multiple distributed storage nodes, with browser-native encryption ensuring that no plaintext data ever leaves the client.

**~12,000 lines of code across 4 programming languages and 3 platforms.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python · FastAPI · SlowAPI |
| Storage Nodes | Go · Rust |
| Frontend | TypeScript · Next.js · Web Crypto API |
| Database | PostgreSQL · Redis |
| Infrastructure | Docker · Docker Compose |

---

## Key Features

### 🔐 Zero-Trust Encryption
- Browser-native **AES-256-GCM** encryption — storage nodes receive only ciphertext, never plaintext
- Two-layer key management: user AES key encrypted by server master key
- Prevents data exposure even under database breach scenarios

### 🛡️ Security-First Design
- **STRIDE threat modelling** applied at design stage (Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Privilege Escalation)
- **SHA-256** chunk integrity verification for every file segment
- **JWT token architecture** with cryptographic type separation between user and node tokens
- **bcrypt** password hashing
- **Web Crypto API** for all client-side cryptographic operations

### ⚡ Self-Healing Replication
- Redis priority queue-based replication engine
- **Empirically measured recovery:** 256 MB data re-replicated in **24.5 seconds** after node failure
- Automatic failover with no manual intervention required

### 🚀 API & Performance
- RESTful API with FastAPI and full OpenAPI documentation
- API rate limiting via SlowAPI to prevent abuse
- WebSocket support for real-time updates
- Distributed across 3 platforms with independent scaling

---

## Architecture

```
Browser (TypeScript + Web Crypto API)
    │
    │ AES-256-GCM encrypted chunks
    ▼
FastAPI Backend (Python)
    │
    ├── PostgreSQL (metadata, user data, chunk index)
    ├── Redis (replication queue, caching)
    │
    └── Storage Nodes
        ├── Node A (Go)
        ├── Node B (Go)
        └── Node C (Rust)
```

---

## Security Model

The system implements a **zero-trust node architecture**:

1. Client generates AES-256-GCM key in browser
2. File is encrypted client-side before upload
3. User AES key is encrypted with server master key
4. Storage nodes store only ciphertext — they cannot decrypt data
5. Even under a full database breach, user data remains protected

---

## Data Integrity

Every file chunk is:
- Hashed with **SHA-256** before storage
- Verified on retrieval — any corruption is detected
- Re-replicated automatically if a node fails

---

## Project Stats

- **~12,000 lines of code**
- **4 programming languages:** Python, TypeScript, Go, Rust
- **3 platforms:** API server, web frontend, storage nodes
- **32+ commits** across development lifecycle
- **Production deployed** and publicly accessible

---

## Graduation Project

Developed as a Software Engineering graduation project at **Çankaya University** (2025–2026).

- Grade: AA
- Live deployment: [storemyfile.com](https://storemyfile.com)
- GitHub: [github.com/ismaiidogan/dsn-bitirme](https://github.com/ismaiidogan/dsn-bitirme)
