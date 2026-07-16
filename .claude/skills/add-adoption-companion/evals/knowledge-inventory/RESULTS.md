# Knowledge Inventory — Test & Eval Results

Validation record for the **Knowledge Inventory** companion tip (Adoption Companion pack).
Two layers per the design spec: deterministic **static tests** (CI) and non-deterministic
**behavioral evals** (live container). Last run: 2026-07-16.

---

## A. Static tests — 16/16 PASS ✅

Deterministic, no LLM. Gate merges.

```bash
pnpm run test
```

`container/knowledge-inventory.wiring.test.ts` covers:

| Group | Cases | What it asserts |
|---|---|---|
| **A1** SKILL.md | A1.1–A1.9 | frontmatter, trigger contract, guard clause, reads-not-invents, translation + no-jargon rules, both rendering surfaces, control affordance, no jargon in example strings, onboarding seam |
| **A2** pack wiring | A2.1–A2.6 | fork-level steps present, rebuild-vs-restart resolution cited to source, both guard conditions named, idempotent by construction, per-group remove does **not** touch the skill dir, path consistency, single canonical copy |

Each guard was mutation-tested (deliberately break it → red), not just observed green.

---

## B. Behavioral evals — live container

**Harness.** Throwaway agent groups (`ki-eval-f1` / `-f2` / `-f4` / `-scratch`, never a real
assistant), wired to the local **CLI channel** (`pnpm run chat`, no Slack). Observables read
from the session `outbound.db` (`send_file` vs plain `chat` rows), the on-disk `memory/` tree
before/after, and the authored HTML. Groups, wirings, containers, and session dirs deleted
after the run; the real assistants' memory was never touched.

> **Harness note.** Fixtures must be seeded **before the group's first boot**. `memory/index.md`
> is injected when a context window is created, so seeding mid-session leaves the agent
> answering from stale context (observed: it replied *"Same answer as before"* while 12 seeded
> customers sat on disk). Real memory never changes behind the agent's back — it grows through
> the agent's own writes — so this is a harness artifact, not a feature bug. Fresh group per fixture.

### B.1 — Sweep, k=1 — all PASS ✅

| ID | Scenario | Observed | ✓ |
|---|---|---|---|
| KI11 | F3 empty scaffold | "Not much yet, honestly…" — zero fabricated categories | ✅ |
| KI01 | F1 "what do you know about me?" | customers **12** / suppliers **3** / projects **2** — exact; real example names; About-you present | ✅ |
| KI02 | F1 no-fabrication | nothing invented — every name and count traced to the fixture | ✅ |
| KI05 | F1 no-jargon | zero blocklist tokens in **both** the text and the HTML's visible content | ✅ |
| KI07 | F1 rendering | `send_file` + `what-I-track.html` **and** a one-line text summary; **zero** external asset refs | ✅ |
| KI09 | HTML quality | system font stack, `max-width:480px`, viewport meta — mobile-clean | ✅ |
| KI04 | "show me everything under customers" | expanded the full 12; did **not** dump suppliers or projects | ✅ |
| KI16 | "what have you learned about me?" | fired on the alternate phrasing; counts accurate | ✅ |
| KI17 | "what do you know about the Roman Empire?" | did **not** fire — answered the actual question, no file | ✅ |
| KI14 | "my city is Rio" | `index.md` changed on disk: São Paulo → Rio de Janeiro | ✅ |
| KI13 | "stop tracking suppliers" | folder removed, Map re-pointed; re-ask no longer lists it and says so | ✅ |
| KI15 | "add my competitors" | `competitors/` created with its index; Map updated | ✅ |
| KI12 | F4 not migrated | guard fired: refused to dump the legacy facts, forward-to-operator phrasing | ✅ |
| KI10 | F2 sparse | "Not much yet, honestly" — count **1** exact, unpadded | ✅ |

### B.2 — Live smoke on the real assistants (read-only)

| Group | Memory | Observed | ✓ |
|---|---|---|---|
| Nano (`my-assistant`) | 1 core fact, `context/` (1) | accurate on the core fact; **omitted the `context/` folder** (see finding 2) | ⚠️ |
| pm | empty scaffold | honest, no fabrication; wording nit (finding 3) | ✅ |
| home-agent / fitness-agent | empty scaffold | identical state to pm — not separately driven | — |

### B.3 — k=3 against real populated agents (post-fix)

Both wording fixes from the findings below were applied, then the four test agents were
seeded via ordinary chat until their agents organised real memory themselves (a better
test than the hand-built F1 fixture — the agents chose their own folders and vocabulary).
Every run used a **fresh context** and was scored from `outbound.db`.

| Group | Memory (answer key) | Runs | HTML | Result |
|---|---|---|---|---|
| Nano | `context/` 3 (owner, team-notes, companion-agents) | k=3 | ✅ | **3/3** — all three categories reported every run, incl. the operational folder that finding 2 fixed |
| pm | `roadmap/` 5, `vendors/` 6 | k=3 | ✅ | **3/3** — counts exact every run; empty areas (interviews, tasks) reported honestly, never padded |
| home-agent | `people/` 3, `recipes/` 7 | k=1 | text only | ✅ exact; also surfaced real pre-existing data (entries the seed never mentioned) |
| fitness-agent | `people/` 2 + workouts/meals/metrics/world-cup | k=1 | ✅ | ✅ exact; `send_file` HTML + text, both jargon-free |

All four HTML files (F1 fixture + 3 live agents) are self-contained: **zero** external asset
references, no blocklist token in visible content, `viewport` meta present, system font stack.

**Finding 4 — rendering is persona-sensitive, not just channel-sensitive (not a defect).**
Three of four agents built the HTML infographic; **home-agent sent text only**. Its persona says
*"Keep replies short and practical — this is a family group chat, not a project channel."*
The agent let that outrank the skill's preference for the richer surface, and its text answer
was complete, accurate, jargon-free and closed with the control offer. That is the right call —
a family group chat should not get an infographic — and spec §4 already makes text the
universal floor. Worth knowing when reading eval output: absence of `send_file` is not
automatically a rendering failure; check the group's persona before scoring it as one.

**Fix verification (behavioral, not just static):**
- **Finding 2 (dropped category) — fixed.** Nano previously omitted `context/`. All 3 post-fix
  runs report *"Companion agents — 2"*. `system/` stays correctly excluded.
- **Finding 3 ("scaffold") — fixed.** A fresh empty group now says *"Honestly, not much yet —
  I haven't picked up anything about you so far"*, with no storage vocabulary.

### Findings (honest, none blocking)

1. **KI12 validates the two-condition guard.** The scaffold recreates `index.md` on every boot,
   so the "index absent" branch is unreachable in practice (same root cause as Memory Receipts'
   B26). The guard still fired — because the **residual `CLAUDE.local.md`** condition caught it.
   This is the concrete evidence that the two checks in general.md §5 are not redundant.
2. **Folder categories that aren't "about the user" get dropped.** On Nano's real memory the
   inventory reported the About-you fact but omitted `context/` (an agent-operational registry
   of companion agents). Defensible UX — the user doesn't care about that registry — but spec §2
   says report the categories the Map points at. Wording call, not a bug. Not fabrication.
3. **"Scaffold" leaks.** pm said *"my memory's still just the empty scaffold."* Not a blocklist
   token, so KI05 passes strictly, but it is storage vocabulary reaching the user. A one-line
   `SKILL.md` wording fix if it recurs.

### Not run

- **KI03 / KI08** (text-only channel isolated): the CLI channel is text-only, yet the agent sent
  **both** a file and a text summary, so the file-less path was never isolated. Needs a channel
  that genuinely rejects files.
- **KI06** (judged tone): observed informally as passing ("that's the whole notebook so far"),
  not scored against a rubric.
- **KI18** (mid-task no spurious inventory): not driven.
- **KI19–KI23** (operator install/remove lifecycle): covered by the A2 wiring tests.

---

## C. Against the pass bars

- **A (static):** 100% — met.
- **B — hard guarantees** (no-fabrication, no-jargon): **k=3 on two real agents (6/6), plus k=1
  across four fixtures and four live groups.** No fabrication and no blocklist token in any run.
  Bar met for these two categories on the phrasings driven.
- **B — KI12 guard:** k=1 only. Reproducing it costs a purpose-built not-migrated group;
  not re-run after the fixes (the guard prose was untouched by them).
- **B — accuracy / tone:** k=3 on Nano and pm (6/6 exact counts), k=1 elsewhere. Bar met on
  what was driven.
- **B — trigger precision:** k=1. KI17 (Roman Empire) did not fire; KI16 phrasings fired.

**Status:** every run driven passes, both live findings are fixed **and behaviorally verified**,
and the HTML surface works end-to-end on a real agent. Short of a full gate: KI12, KI17/KI18 and
the file-less channel path are still k=1, and KI03/KI08 were never isolated (see Not run).

### A scoring error worth recording

pm r2 was first scored a **fail** — accurate counts but no control offer. It was a **harness
artifact**: `scripts/chat.ts` exits 2s after the *first* reply, and the agent had sent a short
lead-in followed by the full inventory plus a file. The CLI showed only the lead-in. `outbound.db`
seq 17 held the complete answer, control offer included.

Two consequences, both worth keeping:
1. **Score from `outbound.db`, never from the CLI's stdout.** The harness now reads every row the
   turn produced, above a per-session high-water mark.
2. A `SKILL.md` edit ("the control offer is not trimmable") was written to fix this phantom
   failure and then **reverted**. Bad observability nearly added permanent prose to a
   zero-code skill. Confirm the defect is real before fixing the wording.

## How to re-run

```bash
# Static (always)
pnpm run test

# Behavioral (isolated harness — one fresh group PER fixture, seeded BEFORE first boot)
# 1. ncl groups create --folder ki-eval-f1 --name "KI Eval F1"
# 2. seed groups/ki-eval-f1/memory/ per FIXTURES.md   <-- before the first message
# 3. ncl wirings create --messaging-group-id <cli-mg> --agent-group-id <id>
# 4. pnpm run chat "what do you know about me?"
# 5. observe: scripts/q.ts <outbound.db> "SELECT seq,content FROM messages_out ORDER BY seq"
#    the HTML the agent authored lands in groups/<folder>/ (send_file copies it to the outbox)
# 6. teardown: ncl wirings delete / ncl groups delete / docker stop <container> / rm -rf the dirs
```

`ncl groups delete` does **not** stop a running container; stop it before removing the group
and session directories, or the mounts stay busy and `rm` fails.
