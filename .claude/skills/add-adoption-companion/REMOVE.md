# Remove the Memory Receipts companion tip (Adoption Companion pack)

Idempotent — safe to run even if the block was never installed or was already removed. Strips the pack's managed block; leaves all other persona content (and the user's `memory/`) untouched. Run Steps 1–2 once per agent group that had it (`ncl groups list`).

## 1. Strip the receipts block

Deletes exactly the `<!-- adoption:receipts … -->` … `<!-- /adoption:receipts -->` span from the group's standing instructions. If no marker is present, the file is returned unchanged (**skip-if-absent** — idempotent by construction). Sibling `adoption:*` blocks from other features are left intact.

```bash
GROUP=<group-folder>          # e.g. my-assistant
FILE="groups/$GROUP/instructions.prepend.md"
test -f "$FILE" || { echo "no instructions.prepend.md — nothing to remove"; exit 0; }

pnpm exec tsx --eval "
import { readFileSync, writeFileSync } from 'fs';
import { removeReceiptsBlock } from '${CLAUDE_SKILL_DIR}/lib/receipts-block.ts';
const f = process.argv[process.argv.length - 1];
writeFileSync(f, removeReceiptsBlock(readFileSync(f, 'utf8')));
" "$FILE"
```

Verify the markers are gone:

```bash
grep -c 'adoption:receipts' "$FILE"   # expect 0
```

## 2. Restart the group

So the container re-composes its persona without the block.

```bash
ncl groups restart --id <group-id>
```

## Note

This removes the **installed block only**. It does not touch the user's memory, the rest of the persona, or the skill files under `.claude/skills/add-adoption-companion/`. To also delete the pack skill itself, remove that directory.
