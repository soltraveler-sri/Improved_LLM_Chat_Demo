# Unified v1 Audit

Date: 2026-03-21
Branch audited: `cursor/unified-demo-audit-c852`

## Audit methodology

- Inspected the current codebase end to end across:
  - `app/demos/unified/page.tsx`
  - `app/demos/branches/page.tsx`
  - `app/demos/codex/page.tsx`
  - `app/demos/history/page.tsx`
  - `components/history/finder-view.tsx`
  - `components/chat/branch-overlay.tsx`
  - `components/codex/task-card.tsx`
  - `/api/respond`, `/api/summarize`, `/api/chats*`, `/api/codex*`, `/api/stacks*`
  - `lib/openai/*`, `lib/store/*`, `lib/codex/*`
- Inspected recent integration-era history and PRs, especially:
  - PR/commit #30 `cc28587` unified intro
  - PR/commit #31 `d797790` Codex race fix
  - PR/commit #34 `dd37d76` branch merge defer/prepend optimization
  - PR/commits #35 `cb08af3` and #36 `539f6cd` chain controller + retry work
  - PR/commit #37 `82d9077` placeholder polling fix
  - PR/commit #42 `047c8e3` unified persistence fix
- Built and ran the app locally.
- Verified storage mode via `GET /api/storage`.
- Important environment note:
  - The local server had **no `OPENAI_API_KEY` configured**, so real model-backed endpoints fail immediately in this environment.
  - To still verify the client-side chain, persistence, merge, and navigation behavior, I used a temporary **headless browser harness** that mocked `/api/respond`, `/api/codex/*`, and `/api/chats/find` while leaving the real `/api/chats*` persistence routes live.
  - That means the report is high-confidence for **app orchestration, persistence, chaining IDs, reload behavior, and UI state**, but not for raw model quality.

---

## 1. Executive Summary

- The unified demo is **close**, but it still has **two conflicting context models**:
  - Codex uses hidden **Responses API chain ingestion**
  - Branch merge in unified uses **client-only pending prepend**
- **Same-session Codex follow-ups are currently wired correctly enough to work**: unified and standalone codex both send follow-ups using ref-backed chain state and queue behind ingestion.
- The most important real bug is **unified Codex reload flakiness**: current code re-enables input **before** task ingestion and stored-thread `lastResponseId` persistence finish, so an immediate reload/reopen can lose Codex context entirely.
- Unified branch merge is the bigger architectural mismatch: it works only for the **next normal message in the same page instance**. Reload/reopen breaks it because the merge was never ingested into the chain.
- Unified hard reload on `/demos/unified` still blanks the active conversation because new threads are **not pushed into the URL**. The user must reopen from the sidebar.
- Unified reopened threads do **not** preserve task cards, and persisted context messages lose their `contextMeta`, so merged-branch UI degrades after reopen.
- Standalone history finder is **not true resume**. "Open" in Finder mode is still the PR #27 preview workaround, not parent-level URL navigation.
- `/api/chats/find` is structurally too shallow for the intended UX: it searches **title + summary metadata only**, not message bodies or transcript snippets.
- Standalone branches is functionally okay as a branch demo, but its persistence layer is still racey enough to drop messages; standalone codex still has **no chat persistence at all**.
- The cleanest way to finish the project is **not** more small tweaks. The project needs:
  1. unified persistence/resume correctness,
  2. one consistent chain-based merge model,
  3. true-resume history search/navigation.

---

## 2. Architecture Map

## 2.1 Standalone Branches demo

Primary file: `app/demos/branches/page.tsx`

How it works:

- Main chat stores `messages` and `lastResponseId` in React state.
- Normal send calls `/api/respond` with `previous_response_id: state.lastResponseId` (`app/demos/branches/page.tsx:195-205`).
- Branch threads live entirely in page state plus `BranchOverlay`.
- Branch side-thread replies chain from:
  - `branch.lastResponseId` if the branch already has replies
  - otherwise `branch.parentAssistantResponseId`
  - (`components/chat/branch-overlay.tsx:263-277`)
- Merge behavior:
  - summary mode may call `/api/summarize`
  - then always calls `/api/respond` to ingest branch context into the main chain
  - returned response ID becomes the new main `lastResponseId`
  - (`app/demos/branches/page.tsx:306-381`, `401-438`)

Persistence:

- Best-effort only.
- Uses `createStoredThread`, `persistMessage`, `updateStoredThread`, all fire-and-forget except the initial `createStoredThread` promise (`app/demos/branches/page.tsx:28-85`).
- Persistence is **not part of the standalone UX**, but it does feed history/search.

Implication:

- Standalone branches has a **single consistent chain model**: merge actually advances the main chain.
- Its persistence sidecar is fragile.

## 2.2 Standalone Codex demo

Primary file: `app/demos/codex/page.tsx`

How it works:

- Local message list contains `user`, `assistant`, and `task` rows.
- `@codex` creates a placeholder task card immediately, then calls `POST /api/codex/tasks`.
- Completed task context is converted to compact text via `buildTaskContextInput()` and ingested into the chat chain via `/api/respond` (`app/demos/codex/page.tsx:39-66`, `126-171`).
- Chain state is maintained via:
  - `lastResponseIdRef`
  - `enqueueChain`
  - `ingestedTaskIdsRef`
  - `isIngestingRef`
  - (`app/demos/codex/page.tsx:97-108`, `126-171`, `175-206`)
- Regular follow-up chat uses `previous_response_id: lastResponseIdRef.current` inside the queued send (`app/demos/codex/page.tsx:400-430`).

Persistence:

- **No chat-thread persistence at all**.
- Tasks and workspace persist in codex store (`lib/codex/store.ts`), but the chat conversation itself is page-local.

Implication:

- Same-session statefulness is reasonably good.
- Reload destroys the chat UX completely.

## 2.3 Standalone History demo

Primary files:

- `app/demos/history/page.tsx`
- `components/history/finder-view.tsx`
- `app/demos/history/chat/page.tsx`

How it works:

- Browse mode:
  - reads `/api/chats` and `/api/stacks/meta`
  - loads transcript with `GET /api/chats/[id]`
  - uses URL `?chatId=...`
  - (`app/demos/history/page.tsx:190-245`, `603-875`)
- Finder mode:
  - classifies via `/api/chats/intent`
  - searches via `/api/chats/find`
  - clicking "Open" **does not use parent routing**
  - it fetches thread data and shows a **local preview**
  - (`components/history/finder-view.tsx:192-220`, `429-476`, `517-597`)
- Separate "context chat" page (`/demos/history/chat`) attaches past-chat summaries to a new message, but that chat itself is also page-local and not persisted (`app/demos/history/chat/page.tsx:117-199`).

Persistence and search contract:

- Depends on chat store threads (`/api/chats*`) keyed by `demo_uid`.
- Finder/search currently depends on **stored thread metadata**, not full messages:
  - lexical candidate generation uses `title` + `summary`
  - LLM rerank prompt also sees only title + summary + updated date
  - message bodies are never loaded in `/api/chats/find`
  - (`app/api/chats/find/route.ts:83-116`, `142-180`, `233-309`)

Implication:

- Browse is true resume.
- Finder is preview-first workaround, not true resume.
- Retrieval quality is fundamentally limited by metadata quality.

## 2.4 Unified demo

Primary file: `app/demos/unified/page.tsx`

How it works:

- Main thread state:
  - `state.messages`
  - `state.lastResponseId`
  - `lastResponseIdRef`
  - `chainQueueRef`
  - (`app/demos/unified/page.tsx:208-226`)
- Normal chat:
  - persists user/assistant messages to `/api/chats`
  - sends queued `/api/respond` calls with `previous_response_id: lastResponseIdRef.current`
  - updates stored thread `lastResponseId`
  - (`app/demos/unified/page.tsx:973-1088`)
- Codex:
  - same task-card UX as standalone codex
  - task context ingestion uses the same chain queue
  - ingestion updates stored thread `lastResponseId`
  - (`app/demos/unified/page.tsx:536-585`, `818-970`)
- Branches:
  - branch overlay is shared
  - branch replies still chain correctly in the side thread
  - but merge no longer ingests into main immediately
  - instead it stores `pendingBranchContextRef`
  - next normal chat prepends that context to the user message
  - (`app/demos/unified/page.tsx:243-249`, `645-700`, `973-982`)
- `/find`:
  - calls `/api/chats/find`
  - result click calls `router.push('/demos/unified?chatId=...')`
  - (`app/demos/unified/page.tsx:748-815`)
- Thread load:
  - only happens when `urlChatId` exists
  - current live thread is **not** pushed into the URL when first created
  - (`app/demos/unified/page.tsx:202-204`, `487-530`)

Implication:

- Unified is the only surface with meaningful end-state potential.
- It already has the right primitives for Codex/stateful chaining.
- Its remaining problems are mostly **persistence/resume semantics** and **branch merge architectural inconsistency**.

## 2.5 OpenAI Responses API chaining

Where `lastResponseId` lives:

- Standalone branches: React state only (`state.lastResponseId`)
- Standalone codex: state + ref, but not persisted as chat thread
- Unified: state + ref + persisted thread `lastResponseId`
- History finder normal chat: state only, ephemeral

Which paths use `previous_response_id`:

- Main chat send in branches, codex, unified
- Branch side-thread send
- Branch merge ingestion in standalone branches
- Codex task ingestion in standalone codex and unified

Important detail:

- Unified current send path uses **`lastResponseIdRef.current`**, not stale React state, inside the queued operation (`app/demos/unified/page.tsx:1022-1033`).
- Standalone codex also uses **`lastResponseIdRef.current`** in queued sends (`app/demos/codex/page.tsx:400-430`).
- Standalone branches still uses plain `state.lastResponseId` (`app/demos/branches/page.tsx:195-203`).

## 2.6 Storage model

Relevant files:

- `middleware.ts`
- `lib/store/index.ts`
- `lib/store/store.ts`
- `lib/store/redis-client.ts`
- `lib/codex/store.ts`

How it works:

- `demo_uid` cookie set in middleware (`middleware.ts:10-31`)
- chat store namespace: `u:{demo_uid}:chat:*`
- codex store namespace: `u:{demo_uid}:codex:*`
- Redis if configured, otherwise in-memory store
- TTL: 7 days

Local audit runtime:

- `GET /api/storage` returned:
  - `mode: "memory"`
  - `backend: "memory"`
  - warning about reset on restart

Implication:

- Local durability is intentionally weak.
- Production/demo-share durability depends on Redis envs existing.

## 2.7 Recent change timeline that matters

- **#28 / `8d1feb3`**: Codex becomes truly stateful by ingesting task context into the chain.
- **#30 / `cc28587`**: unified demo introduced; branches/codex/history combined.
- **#31 / `d797790`**: Codex ingestion changed to **await** before re-enabling input.
- **#34 / `dd37d76`**: unified branch merge changed from immediate hidden ingestion to **pending prepend on next message**.
- **#35 / `cb08af3`**: queue/ref chain controller introduced.
- **#36 / `539f6cd`**: retry/logging/reset logic added, but not fully wired through actual unified send/ingest paths.
- **#37 / `82d9077`**: placeholder task polling fixed.
- **#42 / `047c8e3`**: unified persistence now awaits writes and updates summary.

The two key semantic drifts after those fixes:

1. PR #31's synchronous Codex ingestion was later reverted to background ingestion.
2. Unified branch merge no longer advances the chain at merge time.

---

## 3. Current Feature Matrix

| Feature | Standalone demo status | Unified status | Notes |
|---|---|---|---|
| Normal chat | Branches: Working | Working | Unified uses queued ref-based chain state; branches still uses plain state |
| Response chaining | Branches: Working | Working | Unified/codex use `lastResponseIdRef.current`; branches uses state |
| Create branch | Working | Working | Shared branch overlay |
| Branch side-thread replies | Working | Working | Branch replies chain correctly from parent assistant response |
| Merge branch context into main | Working | Partial | Standalone branches ingests immediately; unified only prepends on next normal message |
| Branch merge survives reload/reopen | N/A / effectively broken UX | Broken | Unified loses pending merge state after reload/reopen |
| `@codex` task start/completion | Working | Working | Placeholder polling fix present |
| Codex follow-up in same session | Working | Working | Verified with queued chain IDs |
| Codex task card persistence across reopen | No | Broken | Unified does not persist task card rows |
| Codex context survives reopen | No persistence | Partial | Unified survives reopen **if ingestion finished first** |
| Codex context survives immediate reload after completion | No persistence | Broken/flaky | Unified can lose it if reload happens before background ingestion finishes |
| `/find` search UI | History finder: Working as preview | Working | Unified result navigation is real URL navigation |
| Finder "Open" true resume | Partial / preview-only | Working | History Finder still local preview; unified navigates to `?chatId=` |
| Search quality against full transcript | Partial / architecturally limited | Partial / architecturally limited | `/api/chats/find` searches only title + summary metadata |
| Thread persistence | History browse works; branches sidecar is racey; codex none | Partial | Unified persists messages but not active route/task cards/context metadata |
| Reload active current chat | Branches: no resume UI | Partial/Broken | Unified hard reload blanks current chat until reopened from sidebar |

---

## 4. Reproduction Results

## 4.1 Environment verification

- `npm install` succeeded
- `npm run build` succeeded
- `GET /api/storage` returned memory fallback
- Real `POST /api/respond` returned `OPENAI_API_KEY not configured`

That means real model-backed behavior could not be executed against OpenAI from this machine.

## 4.2 Unified normal chat

What I ran:

1. Opened `/demos/unified`
2. Sent `Hello unified`
3. Sent `What did I just say?`

What happened:

- Follow-up used the prior response ID and answered correctly in the mocked chain harness.
- Real persisted thread contained user/assistant messages and stored `lastResponseId`.

Evidence:

- Unified send path uses `previous_response_id: lastResponseIdRef.current` inside `enqueueChain` (`app/demos/unified/page.tsx:1022-1033`)
- Stored thread after test had 2 persisted messages and non-null `lastResponseId`

Assessment:

- **Working in-session**

## 4.3 Codex statefulness in standalone Codex demo

What I ran:

1. Opened `/demos/codex`
2. Sent `@codex add a health check endpoint`
3. Asked `what files did you just create?`

What happened:

- Follow-up worked in-session.
- Placeholder task polling did **not** hit placeholder IDs.
- Reload wiped the whole chat/task view.

Evidence:

- Mocked request log showed:
  - task-context ingestion happened
  - next follow-up used the ingestion response ID
- Placeholder GET count stayed at `0`
- Reload returned to empty Codex demo state

Assessment:

- **Working same session**
- **No persistence by design**

## 4.4 Codex statefulness in unified demo

### Same-session follow-up

What I ran:

1. Opened `/demos/unified`
2. Sent `@codex add a health check endpoint`
3. Asked:
   - `what files did you just create?`
   - `what language did you use?`

What happened:

- Same-session follow-ups worked.
- Logged request order:
  - user chat response created `resp_1`
  - Codex ingestion used `previous_response_id: resp_1`
  - first follow-up used `previous_response_id: resp_2`
  - second follow-up used `previous_response_id: resp_3`

Interpretation:

- Current unified same-session follow-ups are **not** using stale state.
- The queue/ref setup is doing its job.

### Reopen after ingestion completed

What I ran:

1. Reloaded `/demos/unified`
2. Reopened the stored thread from the sidebar
3. Asked `what files did you just create?`

What happened:

- Follow-up still worked after reopen.
- Stored thread `lastResponseId` remained the ingested chain head.

What did **not** survive:

- The active chat did **not** survive the hard reload automatically; the page came back blank.
- The task card itself did **not** survive reopen.

Evidence:

- Persisted message roles after unified Codex run were:
  - `user`, `assistant`, `user`, `user`, `assistant`, `user`, `assistant`
- No persisted task-card row
- `blankAfterReload: true`
- `taskCardVisibleAfterReopen: false`

Assessment:

- **Context survives reopen if ingestion already finished**
- **Artifact/UI persistence is incomplete**

### Immediate reload after task completion

What I ran:

1. Started a fresh unified thread
2. Sent only `@codex add a health check endpoint`
3. Reloaded immediately after the task card became ready
4. Reopened the thread
5. Asked `what files did you just create?`

What happened:

- Stored thread `lastResponseId` was still `null` before and after reload.
- The ingestion request never completed before navigation.
- Follow-up answered: `I do not have any Codex task outputs in context.`

Evidence:

- Request log from that run contained only the post-reload follow-up `/api/respond`, not the ingestion call
- Stored thread:
  - `beforeReloadLastResponseId: null`
  - `afterReloadLastResponseId: null`

Assessment:

- **Broken/flaky**
- This is the closest confirmed reproduction of the suspected "Codex context disappears after completion" problem
- It is specifically a **reload / persistence race**, not a same-session stale-ref bug

## 4.5 Branch flow in unified

### Same-session next-message merge

What I ran:

1. Started a unified chat
2. Branched from assistant message
3. In branch: `The password is banana123.`
4. Turned on "Include in main context"
5. Closed branch
6. Asked in main: `What's the password?`

What happened:

- The next normal main-chat message successfully used the merged context.

Assessment:

- **Working only in same page instance, next normal message**

### Reload/reopen before next message

What I ran:

1. Started another unified chat
2. Branched from assistant message
3. In branch: `The password is kiwi456.`
4. Merged branch
5. Reloaded before sending any main-chat follow-up
6. Reopened the thread from sidebar
7. Asked `What's the password?`

What happened:

- Reopened thread visibly showed the persisted branch context text
- But `/api/respond` chained from the **pre-merge** main response ID
- Assistant answered: `I do not know the password.`

Evidence:

- Visible reopened transcript included persisted summary text with `kiwi456`
- Request log:
  - main message: prev `null` → `resp_1`
  - branch message: prev `resp_1` → branch response
  - reopened main follow-up: prev `resp_1`

Assessment:

- **Broken across reload/reopen**
- Confirms unified merge is not durable chain state

## 4.6 `/find` and history

### Standalone history demo

What I ran:

1. Seeded real stored chats through `/api/chats` and `/messages`
2. Opened `/demos/history`
3. Finder query: `Find my chat about Python virtual environment`
4. Clicked `Open`
5. Switched to Browse mode and opened the same thread from the list

What happened:

- Finder `Open` showed transcript preview **without** changing URL
  - URL stayed `/demos/history`
- Browse-mode selection changed URL to `/demos/history?view=browse&chatId=...`

Assessment:

- Standalone history Finder is **preview-only**
- Browse is the only true resume path

### Unified `/find`

What I ran:

1. Opened `/demos/unified`
2. Sent `/find Python`
3. Clicked the result card for `Python environment setup`

What happened:

- Unified navigated to `/demos/unified?chatId=...`
- Transcript loaded into the chat view

Assessment:

- Unified `/find` open path is **true URL-based reopen**

## 4.7 Standalone branches persistence

What I ran:

1. Ran a full branch flow in `/demos/branches`
2. Inspected the real stored thread afterward

What happened:

- Visible branch demo worked
- Persisted thread existed
- But stored roles were:
  - `user`
  - `context`
  - `user`
  - `assistant`
- The first assistant message was missing

Assessment:

- Confirms the standalone-branches persistence race is real

---

## 5. Root Causes

## 5.1 Unified Codex is same-session correct, but reload-flaky because ingestion was moved back to background

Type:

- State/race bug
- Persistence bug

Evidence:

- PR #31 (`d797790`) awaited ingestion before re-enabling input.
- Current code no longer does that.
- Diff evidence:
  - old: `await ingestTaskContext(taskForIngestion)` before user input was re-enabled
  - current: `setIsLoading(false)` first, then `ingestTaskContext(taskForIngestion)` in background
- Current unified code: `app/demos/unified/page.tsx:947-956`
- Ingestion only persists thread `lastResponseId` after completion: `app/demos/unified/page.tsx:563-574`
- Immediate-reload reproduction showed `lastResponseId` stayed `null` and follow-up lost task context.

Why it recurs:

- The queue/ref model preserves same-session correctness.
- But because ingestion/persistence are background work, a reload/navigation between "task appears ready" and "ingestion persisted" drops the chain head.

Confidence:

- **High**

## 5.2 Unified branch merge uses a different context model than Codex, and that mismatch causes reload breakage

Type:

- Architectural mismatch
- Persistence bug

Evidence:

- Unified merge writes to `pendingBranchContextRef` instead of advancing the chain (`app/demos/unified/page.tsx:645-700`)
- Only `handleRegularChat` consumes that pending ref (`app/demos/unified/page.tsx:973-982`)
- The pending ref is not persisted anywhere
- Reopened thread loads stored context message text, but not a pending merge state
- Reproduction showed:
  - merged context text visible after reopen
  - follow-up still used old `previous_response_id`
  - assistant did not know merged secret

Why it recurs:

- Branch context is only "real" for the next normal message in the same browser instance.
- Reload, sidebar reopen, `@codex`, and `/find` do not consume `pendingBranchContextRef`.

Confidence:

- **High**

## 5.3 History Finder "Open" is still the preview workaround, not true resume

Type:

- Architectural/UI mismatch

Evidence:

- PR #27 explicitly changed Finder "Open" into transcript preview workaround
- `FinderView` props define `currentChat`, `onOpenChat`, `isLoadingChat`, but the component destructures only `currentChatId` (`components/history/finder-view.tsx:103-128`)
- `handleOpenChat()` in FinderView fetches preview data locally and never calls parent `onOpenChat` (`components/history/finder-view.tsx:192-220`)
- Live result selection kept URL at `/demos/history`

Why it recurs:

- The history page and FinderView now have two separate models:
  - parent page URL-based transcript loading
  - local preview state in FinderView

Confidence:

- **High**

## 5.4 `/find` cannot reach the intended "natural-language retrieval" end state because it searches metadata, not transcripts

Type:

- Architectural mismatch

Evidence:

- `/api/chats/find` calls `store.listThreads(demoUid)` and never loads thread messages (`app/api/chats/find/route.ts:233-309`)
- Candidate generation scores only `title` and `summary` (`app/api/chats/find/route.ts:83-116`)
- Rerank prompt includes only title, summary, updated date (`app/api/chats/find/route.ts:142-180`)
- Unified summary update uses a short first-exchange excerpt, not a maintained transcript synopsis (`app/demos/unified/page.tsx:1068-1073`)

Why it recurs:

- Even a perfect model cannot recover details that are not present in the stored metadata it is given.
- Later-message facts and branch/codex details are easy to miss.

Confidence:

- **High**

## 5.5 Unified reload/resume is incomplete because current thread identity is not encoded in the URL

Type:

- Local bug
- Persistence/resume mismatch

Evidence:

- New threads are created and stored via `storedThreadIdRef`, but the page does not push `?chatId=...` when a new conversation starts
- Thread load only happens from `urlChatId` (`app/demos/unified/page.tsx:202-204`, `487-530`)
- Live hard-reload result: blank unified page until manual sidebar reopen

Why it recurs:

- The persisted thread exists, but the route is not representing the active chat.

Confidence:

- **High**

## 5.6 Unified does not persist enough metadata to faithfully reconstruct reopened threads

Type:

- Persistence bug

Evidence:

- `handleCodexCommand()` persists only the user `@codex` message, not the task-card row (`app/demos/unified/page.tsx:863-885`)
- `loadChat()` reconstructs stored messages without `taskId`, `isTaskCard`, or `contextMeta` (`app/demos/unified/page.tsx:503-510`)
- Reopened branch-context messages therefore lose compact-pill rendering and show raw text instead
- Reopened unified Codex threads lose the task artifact entirely

Why it recurs:

- Stored message schema is too shallow for unified artifacts

Confidence:

- **High**

## 5.7 Standalone branches still has a real fire-and-forget persistence race

Type:

- Persistence bug

Evidence:

- `createStoredThread().then(...)` is not awaited before the first `/api/respond` call (`app/demos/branches/page.tsx:169-193`)
- Assistant persistence checks `storedThreadIdRef.current`, which may still be null when the assistant response lands (`app/demos/branches/page.tsx:227-241`)
- Live stored thread after standalone branch run was missing the first assistant message

Why it recurs:

- Persistence is explicitly secondary/non-blocking in that page

Confidence:

- **High**

## 5.8 Unified chain reset/retry logic exists but is not actually used on the main send path

Type:

- Local bug / dead-code mismatch

Evidence:

- `respondWithRetry()` exists in unified (`app/demos/unified/page.tsx:335-401`)
- But `handleRegularChat()` calls `fetch('/api/respond')` directly (`app/demos/unified/page.tsx:1025-1033`)
- `ingestTaskContext()` also calls `fetch('/api/respond')` directly (`app/demos/unified/page.tsx:546-553`)
- That means `409 chain_broken` recovery is not actually active for the real send/ingest paths

Why it recurs:

- The recovery helper was added in PR #36 but not wired through all callers

Confidence:

- **High** for the code-path diagnosis
- **Medium** for user-visible impact, since I could not hit real OpenAI chain expiry locally

---

## 6. Recommended Fix Plan

Goal: get to a stable, shareable unified demo with the fewest PRs and the least conceptual churn.

## PR 1 — Unified persistence/resume correctness

Goal:

- Make unified reliable across reload/reopen.

Exact scope:

- Push active unified thread into URL as soon as thread creation succeeds.
- Restore unified artifacts on load:
  - task cards
  - context-card metadata
- Change Codex ingestion from "background and best effort" to "persisted chain state before resume/reload is considered safe"
  - either await ingestion before re-enabling risky navigation/resume transitions
  - or persist an explicit `pendingIngestion` marker and finish/resume it on reload
- Route real unified sends/ingestions through the retry helper instead of direct fetches.

Main files:

- `app/demos/unified/page.tsx`
- likely `lib/store/types.ts` if stored-message shape expands

Risk:

- **Medium**

Why first:

- This fixes the highest-value, user-visible flakiness without changing the core demo model.

## PR 2 — Unify branch merge with the actual chain

Goal:

- Remove the branch-vs-codex context model split.

Exact scope:

- Stop using `pendingBranchContextRef` as the source of truth.
- Merge branch context into the main Responses chain at merge time again.
- Keep the latency optimization only at the summarization stage, not at the "does the chain know this?" stage.
- Persist the returned chain head to stored thread `lastResponseId`.

Main files:

- `app/demos/unified/page.tsx`
- possibly `/api/summarize` prompt handling only if you want a smaller ingestion payload

Risk:

- **Medium**

Why second:

- The current branch behavior is the main remaining architectural mismatch.
- Keeping both "hidden chain ingestion" and "pending prepend" is what will cause endless edge-case tweaking.

Recommendation:

- Be decisive here: **pick chain ingestion as the one real context mechanism in unified**.

## PR 3 — History: true resume + transcript-aware retrieval

Goal:

- Make history actually behave like history, not preview cards over shallow metadata.

Exact scope:

- Finder `Open` in history should call parent navigation and load via URL-based `chatId`, same as browse/unified.
- Keep preview only if you want it as a separate explicit action.
- Expand `/api/chats/find` candidate generation and rerank input to include recent message text / transcript snippets, not just title + summary.
- Update summary maintenance so metadata stays useful after more than the first exchange.

Main files:

- `components/history/finder-view.tsx`
- `app/demos/history/page.tsx`
- `app/api/chats/find/route.ts`
- summary update sites in unified/history flows

Risk:

- **Medium**

Why third:

- This finishes the intended natural-language retrieval story and removes the Finder/Browse split-brain behavior.

## Not recommended as the main path

- Do **not** keep patching around `pendingBranchContextRef` edge cases.
- Do **not** keep preview-only history open while unified uses URL-based resume.
- Do **not** rely on "the queue probably makes it okay" for Codex reload persistence.

Those are the tweak/test loops most likely to waste time.

---

## 7. Risks / Regressions to Avoid

- **Chain management**
  - Do not leave `respondWithRetry()` as dead code after the next refactor.
  - Make all actual `/api/respond` callers use the same wrapper or remove the wrapper entirely.

- **Branch merge**
  - Do not preserve two separate "truths" for context:
    - branch prepend
    - codex ingestion
  - That split is the main systemic problem.

- **Codex ingestion**
  - Do not regress placeholder polling; current fix appears good.
  - Do not re-enable UI/resume semantics before persisted chain state is safe.

- **`/find` persistence**
  - Do not assume "thread exists" means "search can find it."
  - Today search quality depends on title/summary only.

- **Artifact persistence**
  - Do not store only plain text if the unified UI depends on richer message metadata.
  - Otherwise reopened chats will always degrade visually and semantically.

- **History resume**
  - Do not keep the PR #27 preview workaround as the only open path if the intended end state is true resume.

---

## 8. Optional Instrumentation Suggestions

One temporary logging pass would still be valuable before implementing PR 1/2:

### In `app/demos/unified/page.tsx`

Log on every chain mutation:

- action: `user_send`, `codex_ingest`, `branch_merge_ingest`
- `threadId`
- `prevResponseId`
- `newResponseId`
- `storedThread.lastResponseId` before/after patch
- whether `pendingBranchContextRef` was present
- whether page is navigating/reloading

### On thread load

Log reconstructed message kinds:

- plain message
- context message with/without `contextMeta`
- task card with/without `taskId`

### In `/api/chats/find`

Log:

- candidate count
- whether matches came from title/summary only
- whether any result would have been missed without transcript text

That single pass would de-risk the next implementation round substantially.

---

## Bottom line

The project is **not far away**, but the last mile is not "just fix a few small bugs."

The repo truth today is:

- Codex same-session chain state is mostly okay
- unified reload/resume semantics are not okay
- unified branch merge semantics are fundamentally inconsistent with Codex statefulness
- history Finder is still a preview workaround
- `/find` is too metadata-bound for the intended retrieval UX

If you do the next work as:

1. unified persistence/resume correctness,
2. one real chain-based merge model,
3. true-resume transcript-aware history,

you should be able to finish this cleanly without going in circles.
