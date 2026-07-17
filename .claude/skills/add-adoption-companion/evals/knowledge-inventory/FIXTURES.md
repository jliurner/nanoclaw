# Knowledge Inventory evals — fixtures

Four memory states the KI scenarios run against. Seed a **throwaway** group's `groups/<folder>/memory/` before a run — never a real user's group. Each scenario's `setup.fixture` names which one it needs.

The counts here are the answer key: KI01/KI02 assert the agent reports **exactly** these numbers, so if you change a fixture, change the scenario's expectations with it.

---

## F1 — Rich

The main fixture. Enough shape that a fact-dump and an inventory look obviously different.

```
groups/<folder>/memory/
├── index.md              # 4 Core Memory lines + a map pointing at the 3 folders
├── customers/
│   ├── index.md          # lists all 12
│   └── <12 entries>      # e.g. ana-ribeiro.md, downtown-bakery.md, …
├── suppliers/
│   ├── index.md          # lists all 3
│   └── <3 entries>
└── projects/
    ├── index.md          # lists both
    └── <2 entries>       # e.g. new-website.md, winter-catalog.md
```

- **Core Memory (4 lines):** include a city ("based in São Paulo" — KI14 corrects this to Rio) and a preference ("prefers short answers").
- **Entries** follow the native frontmatter rules (`type: customer` / `supplier` / `project`) so the translation step has real internal type names to translate away from.
- **Dates:** give 2–3 entries the newest dates so the optional "recently started keeping track of…" line has something to draw on.
- Folder `index.md` files must be **accurate** — the agent counts from them, so a stale index tests the wrong thing.

**Expected inventory:** customers 12, suppliers 3, projects 2, plus About you.

## F2 — Sparse

Barely-started memory. Tests honesty under thin data (KI10).

```
groups/<folder>/memory/
├── index.md              # 1 Core Memory line ("prefers short answers")
└── customers/
    ├── index.md          # lists the 1
    └── <1 entry>
```

**Expected inventory:** one category with 1 entry, one About-you fact, framed as early days. Not padded.

## F3 — Empty scaffold

What a group looks like on first boot post-#3012: the scaffold ran, nothing has been learned. Tests the strongest temptation to invent (KI11).

```
groups/<folder>/memory/
├── index.md              # scaffold default — "Nothing stored yet"
└── system/
    └── definition.md
```

Create by booting a fresh group once and touching nothing else — that way it's the real scaffold output, not a hand-written imitation.

**Expected inventory:** "I haven't picked up much yet — tell me about yourself and I'll start keeping track." Zero categories.

## F4 — Not migrated

A group that never moved to the new memory model. Tests the runtime guard (KI12).

```
groups/<folder>/
├── CLAUDE.local.md       # legacy durable content, non-empty
└── memory/               # absent, or scaffold-only with no index.md
```

Both guard conditions fail here: no populated `memory/index.md` **and** residual `CLAUDE.local.md`. Also the fixture for the install-time guard (KI20) — `/add-adoption-companion` must refuse and nudge to `/migrate-memory`.

**Expected inventory:** none. The guard message, phrased for the user to forward to their operator.

---

## Channel axis

Independent of the fixture. Each scenario's `setup.channel` picks one:

- **`file`** — a channel where `send_file` lands (the HTML infographic path).
- **`text`** — a channel without file support (the plain-text floor).

Run F1 against both; the content must be identical and only the surface differ (KI03, KI08).

## Running

Per `feature-C-tests.md §D`: stand up a migrated container with the skill installed, drive each scenario's `steps` as real user turns, collect the observables (was a file sent, category names and counts, blocklist tokens present, did a named memory file change after a correction), and judge tone by rubric or by eye. **k = 3–5 runs** per scenario.

Pass bars (§C): the hard-guarantee scenarios — KI02 and KI11 (no fabrication), KI05 (no jargon), KI12 (guard), KI22 (clean removal) — must pass **100%** across all k runs. Accuracy, tone, and trigger precision must hold **≥ 90%**. A sub-bar behavioral result is a `SKILL.md` wording fix; this feature has no code to change.
