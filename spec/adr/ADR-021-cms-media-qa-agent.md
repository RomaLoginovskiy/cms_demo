# ADR-021: CMS Media Q&A Agent via Tool Calling over the CMS API

**Status**: Proposed  
**Date**: 2026-11-02  
**Related**: [ADR-022](ADR-022-vllm-model-serving.md) (model serving), [cms-media-agent.md](../components/cms-media-agent.md) (contract), [ADR-020](ADR-020-aws-data-services-mapping.md) (data stores)

## Context

Users of the CMS want to ask questions in plain language instead of clicking through the gallery and the stats page:

- **Inventory**: "Which images are tagged *nature*?", "What did we upload last week?", "Do we have any CSV files?"
- **Details**: "Tell me about *sunset.jpg*."
- **Statistics**: "How many files are there and how much space do they use?", "What is the largest image?", "Uploads per day this month?", "Which tags are used most?"

What exists today (working tree on 2026-11-02):

| Aspect | Current state | Reference |
|---|---|---|
| Data model | `Media` (Id, FileName, Title, Description, ContentType, Size, UploadedAt) and `Tag`, many-to-many through `MediaTag` | `backend/DemoCms.Core/Models/` |
| Store | SQLite file in the single `cms-backend` pod (`/app/data/media.db`, RWO PVC); PostgreSQL in ADR-020 phase 3 | `backend/DemoCms.Api/Program.cs:26-38` |
| Read API | `GET /api/media` (everything, no paging), `/{id}`, `/tags`, `/filter?tags=` (any tag matches) | `backend/DemoCms.Api/Controllers/MediaController.cs` |
| Aggregates | none on the server; the stats page computes totals and growth from the full list in the browser | `frontend/src/components/MediaStats.tsx` |
| Ordering | done in memory, because the SQLite provider cannot order by `DateTimeOffset` | `backend/DemoCms.Infrastructure/Services/MediaService.cs:49` |
| Auth | none; uploads are anonymous, so titles, descriptions and tags are untrusted text | — |

Constraints:

- The language model is self-hosted on vLLM in Kubernetes (ADR-022). Locally it is a ~1.7B model on CPU; on EKS `dev` an ~8B model on one GPU. Models of that size often get arithmetic and date calculations wrong and degrade with long prompts.
- Numbers in answers (counts, sizes, dates) must be exact. A wrong statistic is worse than no answer.
- The agent must not be able to change data.

## Options

- **A. Tool-calling agent over the CMS REST API.** The model picks from a few read-only tools. The tools call new search and stats endpoints in `cms-backend`, which compute all numbers in code. The model only chooses tools, fills arguments and phrases the answer.
- **B. Text-to-SQL.** The model writes SQL against the media database. The SQLite file sits on an RWO volume inside the `cms-backend` pod, so another pod cannot read it. This option would also need a SQL sandbox, and small models write unreliable SQL. The SQL dialect changes when the store moves to PostgreSQL.
- **C. Retrieval-augmented generation.** Media metadata is embedded, the top-k matches are retrieved and the model answers from them. This cannot answer aggregate questions ("how many", "total size") correctly. It also needs an embedding model, a vector store and re-indexing.
- **D. Whole list in the prompt.** Send `GET /api/media` to the model on every question. The context overflows at a few hundred items, and the model does the arithmetic.

### Options scorecard (1 = worst, 5 = best)

| Characteristic | A: Tools over API | B: Text-to-SQL | C: RAG | D: Full list |
|---|---|---|---|---|
| Numeric correctness | 5 | 3 | 1 | 2 |
| Safety (read-only, injection blast radius) | 5 | 2 | 4 | 4 |
| Fit with 2–8B models | 4 | 2 | 3 | 1 |
| New infrastructure | 4 (two endpoints) | 2 (DB access path, sandbox) | 2 (embeddings, vector store) | 5 |
| Scales with library size | 5 | 4 | 4 | 1 |
| **Total** | **23** | **13** | **14** | **13** |

## Decision

**Option A**, with these specifics:

1. **Aggregates live in `cms-backend`.** Two new read-only endpoints, `GET /api/media/search` (filtered, sorted, paged, with a total) and `GET /api/media/stats` (totals and groupings), compute every number in code. The existing endpoints do not change.
2. **The agent is a separate service, `cms-agent`** (.NET 10, ASP.NET Core, Microsoft.Extensions.AI). It does not live inside `cms-backend`, because:
   - `cms-backend` is one replica with `strategy: Recreate` on RWO volumes and cannot scale out. Long streaming chat requests would compete with CRUD traffic.
   - An LLM outage or slow model must not affect uploads and browsing.
   - The trust boundary stays narrow: the agent has no database access, only HTTP to read endpoints.
3. **Four tools, all read-only**: `search_media`, `get_media_details`, `get_media_stats`, `list_tags`. There is no write, upload or delete tool, and no tool that fetches URLs.
4. **Relative periods resolve in code.** Tools take a `period` enum (`last_7_days`, `this_month`, …). The agent resolves it to UTC `from`/`to`, so the model never does date arithmetic.
5. **Sizes are pre-formatted.** Tool output carries both bytes and a human string (`"4.2 MB"`), so the model never converts units.
6. **The answer is plain text.** The UI renders no Markdown, HTML, links or images. This removes the classic exfiltration channels for prompt injection through user-supplied titles and descriptions.

## Consequences

- `cms-backend` gains two endpoints and a read-only query service. The stats page can later switch to `/api/media/stats` so that the page and the agent report the same numbers (open question AQ4 in the contract).
- Answers are bounded by the tool surface. A question the tools cannot answer gets a short "I can't answer that" plus what the agent can do. Questions about the *contents* of text files (indexed in Elasticsearch) are out of scope for v1.
- One more deployable (`cms-agent`) with its own image, route, NetworkPolicy entry and dashboards.
- The agent sees exactly what the anonymous public API already exposes, so it adds no new data exposure. It does add a compute-cost exposure (GPU time), which ADR-022 and the contract's rate limits address.
- Option B stays the fallback if questions outgrow the tools. Revisit after the PostgreSQL move (ADR-020 phase 3), when a read-only replica user becomes possible.
