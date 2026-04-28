# AiPM Tool Belt — AI Usage Audit

**Prepared for:** Executive meeting with Data Analytics / AI leader
**Project:** AiPM Tool Belt (National Building Specialties — Division 10 specialty subcontractor)
**Stack:** Express + Vite + React + Drizzle ORM (Postgres)
**Audit type:** Discovery only — no code changes
**Audit date:** April 28, 2026

---

## Executive summary

AiPM uses AI in **one** specific way today: **document understanding** (turning PDFs, screenshots, and pasted text from architects, GCs, and vendors into structured data the estimator can edit). It also has a small **support chatbot** that collects bug reports and suggestions.

Everything runs through **OpenAI's chat-completions API** — no other AI providers, no fine-tuning, no embeddings, no vector store, no agents. All calls are made server-side from a single API key (`OPENAI_API_KEY`).

There are **two model SKUs** in use: `gpt-4o` (vision + harder reasoning) and `gpt-4o-mini` (text-only and lightweight tasks).

What's working well:
- AI is scoped to clear, value-creating tasks (extracting schedules, parsing vendor quotes, finding Div 10 spec sections). Nothing speculative.
- All AI sits behind authenticated server routes — no API key in the browser.
- Output is always reviewable by the estimator before it lands in an estimate.

What needs attention before we expand AI use:
- No formal data-handling policy exists for what gets sent to OpenAI (project drawings, vendor pricing, etc.).
- No usage metering, cost dashboard, or per-user budgets.
- No prompt/version registry — prompts live inline in route files, so we can't easily A/B, audit, or roll back changes.
- Console logs include the first 500 chars of AI responses, which can include vendor pricing data.
- A single shared API key is used for all features and all users.

---

## A. Where AI is used (feature inventory)

| # | Feature | User-facing entry point | What it does | Backend file |
|---|---|---|---|---|
| 1 | **Schedule Converter** | `Schedule Converter` page; also embedded in `Estimating Module` "Extract from images / text" | Convert a screenshot or pasted text of a door, signage, partition, etc. schedule into structured line items | `server/openaiScheduleExtractor.ts`, `server/scheduleConverterRoutes.ts`, `server/estimateRoutes.ts` (`extract-images`, `extract-text`) |
| 2 | **Spec Extractor (Division 10)** | `Spec Extractor` page; also from `Estimating Module` ("Extract from spec PDF / images / text") | Find Division 10 specification sections inside a multi-hundred-page bid pack PDF; optionally run an "AI review" pass to catch mis-labeled sections | `server/specExtractorRoutes.ts`, `server/specExtractorEngine.ts`, `server/openaiSpecExtractor.ts`, `server/pdfParser.ts` |
| 3 | **Vendor Quote Parsing** | `Estimating Module` → "Parse quote" + "Process quote backup" | Convert a vendor quote PDF or image into structured line items, totals, and material totals | `server/estimateRoutes.ts` (`/ai/parse-quote`, `/ai/parse-quote-pdf`, `/quotes/extract-total`, `/quotes/:quoteId/process`) |
| 4 | **Screenshot Extractor** | Internally called by the schedule flows when the user pastes a BuildingConnected/Procore screenshot | OCR the image, then ask the model to structure the visible bid information | `server/screenshotExtractor.ts` |
| 5 | **Support Chatbot** | `SupportChatWidget` (floating button in `Header.tsx`); used on Help Center, Project pages, etc. | A focused assistant that collects bug reports and feature requests, asks clarifying questions, and produces a structured submission for Haley | `server/chatService.ts`, `server/chatRoutes.ts` |
| 6 | **Plan Parser** | `Plan Parser` jobs | Tag PDF drawing pages as relevant to a Division 10 scope. **Currently keyword/regex only — not AI.** Listed here so leadership knows it is a "candidate" feature, not an active AI feature. | `server/planparser/*` |

**Not AI-powered (often assumed to be):**
- The plan parser page tagging (rule-based classifier).
- The estimate's overhead/profit math, proposal log syncing, Google Sheet sync.
- Any pricing decisions or auto-acceptance — every AI output is staged for human review.

---

## B. Models, providers, and dependencies

**Provider:** OpenAI (only). Direct REST via the `openai` npm package.

| Package | Version | Used for |
|---|---|---|
| `openai` | 6.19.0 | All chat-completion calls |
| `tesseract.js` | 7.0.0 | Local OCR before sending text to OpenAI (vendor quotes, plan parser, screenshots) |
| `pdf-parse` | 2.4.5 | Local PDF → text (spec books, vendor quote PDFs) |
| `pdfjs-dist` | 5.4.530 | Local PDF rasterization for OCR |

**Models in use today:**

| Model | Where it's called | Why this model |
|---|---|---|
| `gpt-4o` | Image-based extraction: schedule images, spec page images, vendor quote images, plan vision parse | Vision + harder JSON reasoning |
| `gpt-4o-mini` | Text extraction (PDF text, OCR text), spec section identification & detail extraction, AI review of spec sections, support chatbot, "extract total" from PDF text | Cheaper, fast, sufficient for text |

**Where the model name is hard-coded** (relevant for the AI lead's "model governance" question):

```
server/openaiScheduleExtractor.ts:6      DEFAULT_MODEL = "gpt-4o"
server/openaiScheduleExtractor.ts:7      FALLBACK_MODEL = "gpt-4o-mini"
server/openaiSpecExtractor.ts:8          DEFAULT_MODEL = "gpt-4o-mini"
server/chatService.ts:5                  MODEL = "gpt-4o-mini"
server/screenshotExtractor.ts:189        model: "gpt-4o-mini"
server/screenshotExtractor.ts:229        model: "gpt-4o"
server/specExtractorRoutes.ts:460        model: "gpt-4o-mini"   (AI review)
server/estimateRoutes.ts:205             model: "gpt-4o"        (extract spec text)
server/estimateRoutes.ts:230             model: "gpt-4o"        (extract spec images)
server/estimateRoutes.ts:823             model: "gpt-4o-mini"   (extract total from PDF)
server/estimateRoutes.ts:850             model: "gpt-4o"        (extract total from image)
server/estimateRoutes.ts:1037            model: "gpt-4o-mini"   (vendor quote PDF text)
server/estimateRoutes.ts:1047            model: "gpt-4o"        (vendor quote image)
server/estimateRoutes.ts:1430            model: "gpt-4o"        (parse-quote)
server/estimateRoutes.ts:1486            model: "gpt-4o"        (parse-quote-pdf)
```

There is **no central config** — each route declares its own model.

**Other notable runtime parameters:**
- `response_format: { type: "json_object" }` enforced on most data-extraction calls.
- Vendor quote image calls use `detail: "high"` (more tokens), the "extract total" image call uses `detail: "low"`.
- `max_tokens` ranges from 150 (extract total) to 8000 (large schedule extractions).
- Chat assistant uses `temperature: 0.7`; AI Review uses `temperature: 0.1`; other extraction calls use the API default.

**No usage of:** embeddings, function calling / tool use, assistants API, fine-tuning, batch API, streaming, structured-output (JSON schema), Realtime, Whisper, DALL·E, OpenAI Files.

---

## C. Data flow — what leaves our environment and goes to OpenAI

Every AI feature follows the same shape. The user uploads or pastes content → the **Express server** does any local prep (OCR, PDF→text, image base64) → the server calls OpenAI → JSON response is parsed → result is returned to the React UI for the user to review/accept.

The browser **never** holds the OpenAI key and **never** calls OpenAI directly.

### What gets sent to OpenAI

| Feature | Payload sent to OpenAI |
|---|---|
| Schedule Converter (image) | Full schedule page **as base64 image** (PNG/JPG, up to 20 MB upload limit) + system prompt |
| Schedule Converter (text) | Pasted schedule text, full string |
| Spec Extractor (PDF) | OCR/extracted text. For large bid packs: only the first ~50 KB of "Division 10 segments" found by regex (see `extractDiv10Segments` in `server/estimateRoutes.ts:253`). |
| Spec Extractor (image) | Each spec page as base64 image, `detail: "high"` |
| Spec Extractor AI Review | A JSON summary per section: section number, current title, folder name, **first 1000 chars of the start page**, **first 500 chars of the end page**, plus the project name |
| Vendor Quote (PDF) | First **8 000 – 12 000 chars** of OCR'd quote text |
| Vendor Quote (image) | Full image as base64 |
| "Extract total" | First 8 000 chars of PDF text, **or** the image at `detail: "low"` |
| Support Chatbot | Full conversation history (system prompt + every user/assistant turn in this session) |

### What is intentionally **not** sent
- Database rows are not directly sent. Vendor quote backups stored in `estimateQuotes.backupFileData` (BYTEA) only get re-sent if the user explicitly re-runs the parse.
- We do not pre-load any company SOPs, pricing history, or estimator notes into prompts.
- Source documents are stored on the server filesystem only for the **Spec Extractor** flow (`data/spec-extractor/<sessionId>.pdf`) so the AI Review pass can re-OCR pages on demand. They are deleted when the session is deleted via `DELETE /api/spec-extractor/sessions/:id`. There is **no scheduled cleanup**.

### Sensitivity classification (rough)

| Data type | Sent to OpenAI? | NBS sensitivity |
|---|---|---|
| Architectural drawings / spec books (often confidential bid packs from GCs) | Yes (PDF text, page images) | **Medium-High** — usually NDA'd |
| Vendor quotes — pricing | Yes (text, sometimes images) | **High** — vendor-confidential commercial terms |
| Internal estimate totals, OH&P, margins | **No** (not sent) | High |
| User chat messages (bug/suggestion submissions) | Yes | Low–Medium (may contain screenshots) |
| User PII (name, email) | Not in prompts | — |

> **Question worth raising in the meeting:** does NBS have a stance on sending GC drawings and vendor-pricing PDFs to OpenAI? Today we are operating under OpenAI's standard API terms (zero-day data retention for API requests, not used for training by default), but we have **not** signed a Zero Data Retention (ZDR) addendum or a BAA, and we have **not** asked vendors/GCs whether they consider this a sub-processor disclosure event.

---

## D. Storage of AI inputs and outputs

| What | Where | Retention |
|---|---|---|
| Spec Extractor source PDFs | `data/spec-extractor/<sessionId>.pdf` on server disk | Until the user deletes the session. No TTL. |
| Spec Extractor session + sections | `spec_extractor_sessions`, `spec_extractor_sections` tables | Same as above |
| Vendor quote backup files | `estimate_quotes.backup_file_data` (BYTEA in Postgres) | Lifetime of the estimate |
| Chat sessions (full transcript) | `chat_sessions.messages` JSONB column | **Indefinite.** No purge job. |
| Chat screenshots (pasted) | `feedback_screenshots.file_data` BYTEA | **Indefinite** |
| Extracted schedule items | `estimate_line_items` (after user accepts) | Lifetime of the estimate |
| Plan parser pages, OCR text | `plan_parser_*` tables | Lifetime of the job |
| **OpenAI request/response payloads** | **Not stored anywhere in the app.** | n/a |

**No AI-call audit log** (who called what model, with what input, when, how many tokens). This is a gap if leadership wants per-user attribution or to reproduce a specific extraction.

---

## E. Risk & gap register

Ordered by what I'd raise first in the meeting.

### 1. No data-handling policy for third-party AI
- We send GC bid packs and vendor pricing to OpenAI's public API.
- No documented policy, no signed DPA / ZDR, no notice to GCs/vendors.
- **Recommend:** policy doc + decide whether to negotiate ZDR with OpenAI, or move sensitive flows to Azure OpenAI / on-prem.

### 2. No cost governance
- No usage dashboard, no per-user/per-feature spend tracking.
- One shared API key — if it leaks, every feature stops; we can't rotate one feature at a time.
- No `max_tokens` ceiling on the system as a whole; some calls allow up to 8 000 output tokens.
- **Recommend:** OpenAI org-level usage tags + per-feature API keys (or at least project-scoped keys), monthly soft limit.

### 3. Prompts live inline, no versioning
- ~10+ system prompts are string literals inside route files (`estimateRoutes.ts`, `chatService.ts`, `specExtractorRoutes.ts`, `openaiSpecExtractor.ts`).
- We can't A/B test, can't diff "what changed in the prompt that made extraction worse last week".
- **Recommend:** consolidate prompts into `server/prompts/` with a version number and a small registry; log `promptVersion` alongside results.

### 4. Logging of partial AI output
- `server/screenshotExtractor.ts:201` and `:249` log the first 500 chars of every AI response (vendor quote text included).
- These flow into Replit deployment logs.
- **Recommend:** behind a `DEBUG_AI` flag, redact dollar amounts, or drop entirely.

### 5. No guardrails on prompt injection
- Vendor quotes and spec text are placed verbatim inside `user` messages with instructions like *"Respond ONLY with valid JSON"*.
- A malicious or playful PDF can include "ignore prior instructions" text. Worst case today is bad extracted line items the estimator already reviews — but it's worth knowing.
- **Recommend:** wrap user content in clear delimiters, add a final-instruction "reminder", and consider OpenAI's `responses` API with strict JSON schema.

### 6. Single shared key, no per-user / per-tenant attribution
- Calls do not include OpenAI's `user` field, so abuse / per-user spend can't be traced server-side.
- **Recommend:** pass `user: <hashed userId>` on every call.

### 7. Chat transcripts and screenshots never expire
- `chat_sessions.messages` and `feedback_screenshots.file_data` grow forever.
- Currently small, but worth a retention rule (e.g. 18 months) once volume picks up.

### 8. No fallback / circuit breaker
- If OpenAI returns 429/5xx on a heavy spec PDF, the user gets a generic 500.
- `openaiScheduleExtractor.ts` does have a fallback from `gpt-4o` → `gpt-4o-mini`; nothing else does.
- **Recommend:** uniform retry+fallback wrapper.

### 9. Hard-coded model strings spread across files
- Migrating to `gpt-4.1`, `gpt-5`, Azure, or a different provider means ~14 separate edits today.
- **Recommend:** central `server/aiClient.ts` with named "tasks" → model mappings.

### 10. No evals
- We have no golden set of (input → expected output) pairs for any of these extractors. We rely on "the estimator will catch it".
- **Recommend:** build a small eval harness for the schedule extractor first (highest blast radius).

---

## F. Recommendations (prioritized for the AI leader's discussion)

**Must-do before more AI is added:**
1. Decide on a data-sharing policy with OpenAI (ZDR? Azure OpenAI? on-prem?). Document it.
2. Move all model selection to one config file; add per-feature usage tagging.
3. Stop logging AI response substrings in production.
4. Add the `user` field to every OpenAI call for per-user attribution.

**Should-do soon:**
5. Centralize prompts in `server/prompts/`, version them, log `promptVersion` with results.
6. Add a uniform retry + fallback wrapper around all OpenAI calls.
7. Build a golden-set eval for the schedule extractor (highest-volume, highest-impact AI feature).
8. Add a TTL/cleanup job for `data/spec-extractor/*.pdf` and a retention rule for chat sessions.

**Could-do as we mature:**
9. Adopt OpenAI **structured outputs** (JSON-schema constrained) on extraction calls — eliminates a lot of `JSON.parse` defensive code.
10. Consider **embeddings + a small RAG store** for the support chatbot so it can actually answer "how do I…" questions from NBS SOPs (the chatbot prompt explicitly admits it has no SOP access today — that's the obvious next AI feature).
11. Re-examine the plan parser: classifying drawing pages by scope is a natural fit for a small fine-tuned vision model or `gpt-4o` with structured outputs, instead of pure regex.

---

## Appendix: full route table

All routes below sit behind `requireAuth` (enforced in `server/routes.ts:106–110` for `/api/*` except `/api/auth/*`, `/api/version`, `/health`).

| Method | Route | AI used | Model |
|---|---|---|---|
| POST | `/api/chat/message` | yes | gpt-4o-mini |
| POST | `/api/schedule-converter/extract` | no (Tesseract OCR only) | — |
| POST | `/api/toolbelt/schedule-to-estimate` | yes | gpt-4o → gpt-4o-mini fallback |
| POST | `/api/toolbelt/schedule-text-to-estimate` | yes | gpt-4o → gpt-4o-mini fallback |
| POST | `/api/spec-extractor/upload` | indirect — kicks off background job | gpt-4o-mini |
| POST | `/api/spec-extractor/sessions/:id/ai-review` | yes | gpt-4o-mini |
| POST | `/api/estimates/:id/extract-images` | yes | gpt-4o → gpt-4o-mini fallback |
| POST | `/api/estimates/:id/extract-text` | yes | gpt-4o → gpt-4o-mini fallback |
| POST | `/api/estimates/:id/extract-spec-images` | yes | gpt-4o |
| POST | `/api/estimates/:id/extract-spec-text` | yes | gpt-4o |
| POST | `/api/estimates/:id/extract-spec-pdf` | yes | gpt-4o (text path) |
| POST | `/api/estimates/quotes/extract-total` | yes | gpt-4o-mini (PDF) / gpt-4o (image) |
| POST | `/api/estimates/quotes/:quoteId/process` | yes | gpt-4o-mini (PDF) / gpt-4o (image) |
| POST | `/api/estimates/ai/parse-quote` | yes | gpt-4o |
| POST | `/api/estimates/ai/parse-quote-pdf` | yes | gpt-4o |
| POST | `/api/planparser/jobs` (and `/demo`) | no (regex classifier + Tesseract) | — |

Environment variables involved:
- `OPENAI_API_KEY` — required for all AI features.
- `SPEC_EXTRACTOR_URL` — optional, used to off-load spec extraction to an external service if configured (currently unused).
- `SENDGRID_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` — email only, not AI.
