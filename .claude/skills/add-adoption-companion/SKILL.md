---
name: add-adoption-companion
description: Install the Adoption Companion pack into an agent group — a growing bundle of opt-in "companion tips" that help a user adopt and kickstart the assistant. Ships with the Memory Receipts tip (a light "📝 Noted" when the agent learns a durable fact). Opt-in, off by default, reversible.
---

# Add Adoption Companion pack

Installs the **Adoption Companion** pack into one agent group's standing instructions. The pack is a growing bundle of small, opt-in **companion tips** that help a user adopt and kickstart their assistant. It ships today with its first tip — **Memory Receipts**: when the agent saves a new, meaningful durable fact about the user, it drops a glanceable `📝 Noted` message so the user *sees* it learn and can correct it in plain chat. More companion tips get added to the same pack over time; each is self-contained and independently toggleable.

The pack is a distribution bundle; each companion tip is self-contained at runtime. This install:

- Appends a managed block (`<!-- adoption:receipts v=1 -->` … `<!-- /adoption:receipts -->`) to the target group's `groups/<id>/instructions.prepend.md`.
- Ships the block **off** (`Receipts: OFF.`). The user turns it on later by asking in chat.
- Adds **zero** runtime code — no MCP tools, no hooks, no core changes. The only code is a pure, install-time block helper (`lib/receipts-block.ts`).

> **Why a per-group standing block, not a `container/skills/…` skill?** A receipt must fire mid-turn the moment a fact is saved — that needs *always-in-prompt standing behavior*, whereas a container skill is model-invoked by relevance (it can't guarantee the timing). And receipts are opt-in per user-facing group, while a container skill mounts into **every** group in the fork. So the per-group `instructions.prepend.md` is both the reliable trigger and the correct blast radius.

## Integration tests

The block's *runtime* behavior (does the agent receipt the right facts, batch, honor the toggle) has **no in-tree integration test** by design — same posture as `add-rtk`. It is a standing-instruction block plus the existing `send_card` tool, so there is no source reach-in a unit test could guard; it is verified behaviorally via the evals in `evals/adoption-receipts/` against a real migrated container.

The **exception** is the pure install-time helper (`lib/receipts-block.ts`), which *is* unit-tested: `tests/receipts-block.test.ts`, run by `pnpm run test` (and by CI) via the `.claude/skills/**/tests/*.test.ts` glob in `vitest.config.ts`. Run it after any change to the helper or the block template.

## Step 1 — Identify the target agent group

Receipts belong on the **user-facing assistant** group, not Builder/Researcher sub-agents (personas are per-group; sub-agents don't inherit). Repeat Steps 2–4 for each user-facing group you want it on.

```bash
ncl groups list
```

Note the group's folder under `groups/` (e.g. `groups/my-assistant/`).

**Install on the user-facing assistant group as-is — any session mode works.** Receipts read two per-group files that core loads at **every** session start regardless of session mode: the group's Core Memory (`memory/index.md`) and the block's `Receipts: ON/OFF` line. So saving, dedup of already-known facts, the toggle, and per-turn batching hold even when each message lands in its own session (a threaded channel), and the block tells the agent to engage-and-save on the first message of a session rather than cold-greet. Keep the group's existing channel wiring.

**Optional — cross-turn continuity.** If you *also* want the agent to carry conversational context across turns (unrelated to receipts — e.g. resolving "forget that" against the previous message rather than only against memory), give the group a single continuous session. This is a channel-wiring choice, not a receipts requirement:

```bash
ncl wirings list                                          # note the wiring id
ncl wirings update <wiring-id> --threads 0                # channel replies un-threaded; shared session applies
# or, to keep threaded replies on a single-channel assistant:
ncl wirings update <wiring-id> --session-mode agent-shared
```

(A 1:1 DM, `is_group=0`, is continuous automatically.) Background on why a threaded channel otherwise fragments sessions: `src/router.ts` upgrades a group chat with threading on to `per-thread` regardless of the wiring's `session_mode`. Leaving it fragmented is fine for receipts.

## Step 2 — Guard: confirm the group is on the new memory model

These features require the post-#3012 memory model, proven by **two** conditions — check **both**:

```bash
GROUP=<group-folder>          # e.g. my-assistant

# (a) UPDATED: the memory scaffold exists (auto-created on first boot post-#3012)
test -f "groups/$GROUP/memory/index.md" && echo "index.md: present" || echo "index.md: MISSING"

# (b) MIGRATED: no durable content stranded in a legacy CLAUDE.local.md
if [ -s "groups/$GROUP/CLAUDE.local.md" ]; then echo "CLAUDE.local.md: residual content — NOT migrated"; else echo "CLAUDE.local.md: clean"; fi
```

The two checks are **not** redundant: the scaffold auto-creates `index.md`, so its presence proves the version is new enough but **not** that old content moved over — the `CLAUDE.local.md`-residue check is what confirms migration.

**If either fails, STOP.** Do not install. Tell the operator:

> *"This group isn't on NanoClaw's new memory system yet. Run **update** + **`/migrate-memory`** for it first, then re-run `/add-adoption-companion`."*

## Step 3 — Insert the block

Idempotent: appends the v1 block if absent; if a block already exists, it refreshes the body **and preserves the current `Receipts: ON/OFF` value** (a re-install never flips a user's ON back to OFF). Uses the pure helper — no core code runs.

```bash
FILE="groups/$GROUP/instructions.prepend.md"
touch "$FILE"   # group-persona.ts stages this file with wx; we append to it

pnpm exec tsx --eval "
import { readFileSync, writeFileSync } from 'fs';
import { applyReceiptsBlock } from '${CLAUDE_SKILL_DIR}/lib/receipts-block.ts';
const f = process.argv[process.argv.length - 1];
writeFileSync(f, applyReceiptsBlock(readFileSync(f, 'utf8'), { version: 1 }));
" "$FILE"
```

Verify the block landed once, off:

```bash
grep -c 'adoption:receipts v=1' "$FILE"   # expect 1
grep 'Receipts:' "$FILE"                  # expect **Receipts: OFF.** on a fresh install
```

## Step 4 — Restart the group so the new persona takes effect

Standing-instruction changes apply on the next container spawn.

```bash
ncl groups restart --id <group-id>
```

## Step 5 — Fork-level: install the Knowledge Inventory tip (once per fork)

The pack has **two install scopes**. Steps 1–4 above are **per-group** (Memory Receipts is a standing block in one group's persona). This step is **fork-level**: Knowledge Inventory is a container skill under `container/skills/`, which is repo-level — writing it makes it available to **every** agent group in this fork at once. Run it once per fork; it is idempotent, so running it again on a later per-group install is a no-op.

Knowledge Inventory is **reactive**: when the user asks *"what do you know about me?"*, the agent shows a plain-language picture of what it tracks — categories, counts, a few examples — and offers to add, fix, or stop tracking anything. It has **no toggle**: a feature that only ever answers when asked can't bother anyone, so fork-wide availability is intentional and safe (it only ever reveals that agent's own memory).

### 5a — Guard

Same two conditions as Step 2 — the tip reads the new memory model. Check the group(s) you're installing for:

```bash
GROUP=<group-folder>
test -f "groups/$GROUP/memory/index.md" && echo "index.md: present" || echo "index.md: MISSING"
if [ -s "groups/$GROUP/CLAUDE.local.md" ]; then echo "CLAUDE.local.md: residual content — NOT migrated"; else echo "CLAUDE.local.md: clean"; fi
```

**If either fails, STOP** — do not install. Same operator message as Step 2:

> *"This group isn't on NanoClaw's new memory system yet. Run **update** + **`/migrate-memory`** for it first, then re-run `/add-adoption-companion`."*

### 5b — Ensure the skill directory is present

`container/skills/knowledge-inventory/SKILL.md` is the canonical copy and ships with this fork, so on a normal install it is already in place and this step confirms it. Restore it from git when it is absent — a fork-level uninstall (`REMOVE.md` Part B) deletes it, and this is the path that brings it back. Idempotent: present → confirm and move on; absent → restore.

```bash
if [ -f container/skills/knowledge-inventory/SKILL.md ]; then
  echo "knowledge-inventory: already present"
else
  mkdir -p container/skills/knowledge-inventory
  git show HEAD:container/skills/knowledge-inventory/SKILL.md > container/skills/knowledge-inventory/SKILL.md
  echo "knowledge-inventory: restored"
fi
```

Git is the single source for this file. An update is `git show HEAD:<path> > <path>` again — the tracked copy is canonical, there is no second copy to keep in sync, and no per-user state to preserve.

### 5c — Activate: restart the group

**Restart activates the tip.** Groups also pick it up on their next message.

```bash
ncl groups restart --id <group-id>
```

Restart is sufficient because activation is resolved entirely at spawn: `container/skills/` is bind-mounted read-only at `/app/skills` (`src/container-runner.ts:342-344`), and skill selection defaults to `"all"` (`src/db/migrations/014-container-configs.ts:17`), which `selectedSkillNames()` recomputes from the directory listing on every spawn (`src/container-runner.ts:420-431`) — so a newly added directory is discovered and symlinked into the group's skills dir automatically.

**One caveat — explicit skill lists.** `selectedSkillNames()` only rescans the directory when a group's skill selection is `"all"`; an explicit array is returned verbatim (`src/container-runner.ts:420-431`). So a group pinning a list never gets a symlink for the new skill and **silently** never invokes it — the files are mounted, but invisible to the agent.

This is rare: the column defaults to `"all"` and no `ncl` verb sets it otherwise (`config update` is scalars only). The one path that produces an explicit list is `src/backfill-container-configs.ts:62`, migrating a **legacy v1 `container.json`** that hand-picked skills. A fresh v2 group can't be in this state — check anyway if this fork came from v1:

```bash
ncl groups config get --id <group-id> | grep -i skills   # "all" → nothing to do
```

If it's an array, append the name. There is no `ncl` verb for this (skills is a JSON column; only `mcp_servers` and `packages_*` have add/remove verbs), so write it directly. The `json_type` + `NOT EXISTS` guards make this safe to re-run and a no-op on `"all"` rows:

```bash
pnpm exec tsx scripts/q.ts data/v2.db \
  "UPDATE container_configs
   SET skills = json_insert(skills, '\$[#]', 'knowledge-inventory')
   WHERE agent_group_id = '<group-id>'
     AND json_type(skills) = 'array'
     AND NOT EXISTS (SELECT 1 FROM json_each(container_configs.skills) WHERE value = 'knowledge-inventory')"
```

Then restart that group. (Use `scripts/q.ts`, not the `sqlite3` CLI — setup never installs that binary; see `setup/verify.ts:5`.)

### 5d — Report the fork-level blast radius

Do not let this scope be a surprise. See the Report section below.

## Report

Tell the operator — **both scopes**, explicitly:

**Per-group (Memory Receipts):**
- Memory receipts are **installed and OFF** on `groups/<id>/`.
- The **user** enables it by asking in chat (e.g. *"tell me when you learn something about me"*); the agent flips the block to `Receipts: ON.` The user turns it off the same way (*"stop telling me what you learned"*).
- Off ≠ uninstall — memory keeps working; only the surfacing stops. Full removal is `REMOVE.md`.

**Fork-level (Knowledge Inventory):**
- Knowledge Inventory is now available to **all assistants in this fork** (newly installed / already present — say which). This is by design: it only answers when asked, and only about that agent's own memory.
- There is **no toggle** and nothing for the user to enable — they can just ask *"what do you know about me?"*.
- It is **not** removed when you remove the pack from a single group (other groups may still use it). Only a full uninstall deletes it — see `REMOVE.md`.

## Optional — install across all existing groups at once

Receipts are **per-agent-group** (personas don't inherit between groups), so each user-facing group needs the block. To roll it out to every eligible existing group in one pass, run the guard + insert per group. Skip Builder/Researcher/utility groups — receipts belong on **user-facing assistants** only.

```bash
# List groups and their folders, then loop. Review the list first and exclude
# any non-user-facing groups (builders, researchers, sport/home bots you don't
# want receipting) by editing GROUPS.
GROUPS="$(ls groups/)"        # or hand-pick: GROUPS="my-assistant fitness-agent"

for GROUP in $GROUPS; do
  idx="groups/$GROUP/memory/index.md"; loc="groups/$GROUP/CLAUDE.local.md"
  if [ ! -f "$idx" ] || [ -s "$loc" ]; then
    echo "SKIP $GROUP — not migrated (run update + /migrate-memory first)"; continue
  fi
  FILE="groups/$GROUP/instructions.prepend.md"; touch "$FILE"
  pnpm exec tsx --eval "
import { readFileSync, writeFileSync } from 'fs';
import { applyReceiptsBlock } from '${CLAUDE_SKILL_DIR}/lib/receipts-block.ts';
const f = process.argv[process.argv.length - 1];
writeFileSync(f, applyReceiptsBlock(readFileSync(f, 'utf8'), { version: 1 }));
" "$FILE"
  echo "OK   $GROUP — installed OFF"
done
```

Every group ships `OFF`; users opt in per group. Re-running preserves each group's existing ON/OFF (idempotent). Restart each group (or let it restart on next message) to pick up the persona.

## Optional — inherit into newly created agents (template)

New agents are stamped from a **template** (`context/instructions.md` → the new group's `instructions.prepend.md`); nothing is copied from the creating agent (`src/templates/create-agent.ts`). To make future agents inherit receipts, append the block to a template's `context/instructions.md`:

```bash
TPL="templates/<your-assistant-template>/context/instructions.md"
pnpm exec tsx --eval "
import { readFileSync, writeFileSync } from 'fs';
import { applyReceiptsBlock } from '${CLAUDE_SKILL_DIR}/lib/receipts-block.ts';
const f = process.argv[process.argv.length - 1];
writeFileSync(f, applyReceiptsBlock(readFileSync(f, 'utf8'), { version: 1 }));
" "$TPL"
```

**Caveats:** (1) only agents created **via that template** (`ncl groups create --template …`) inherit it — not ones made by `/init-first-agent` or the setup wizard. (2) It blankets **every** agent from that template, so only add it to a **user-facing/assistant** template, never a generic or Builder one (spec #150). (3) It ships `OFF`, same as a direct install.

## Running the behavioral evals later

The `📝 Noted` behavior is verified against a **real migrated container**, not source tests. Scenario files live in `evals/adoption-receipts/B01.md` … `B38.md` (`§B.0` format: `setup` / `steps` / `expect`; B34–B38 cover durable facts embedded in longer task instructions). To run them:

1. Stand up a migrated group with the block installed and `Receipts: ON.` (or `OFF.` for the off-path scenarios).
2. Drive each scenario's `steps` as user turns on that channel (`card` vs `text`).
3. Check the observables: number of `send_card`/fallback messages, whether `memory/index.md` changed, and the `Receipts: ON/OFF` line value after the turn. Judge tone (glanceable, plain-language, jargon-free) manually or with an LLM rubric.
4. Run each scenario k=3–5 times for stability. Pass bars: hard-guarantee categories (toggle, correction, guard, lifecycle) 100%; discrimination/tone ≥90%. Recorded results live in `evals/RESULTS.md`.
