import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Install/remove wiring guards for the Adoption Companion pack.
//
// The pack has two install scopes — a per-group Memory Receipts block and a
// fork-level Knowledge Inventory container skill — and they must not bleed into
// each other. That, plus the core behavior the fork-level install depends on, is
// what this file guards. The tip's own content invariants live next door in
// knowledge-inventory.skill.test.ts.
const packRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(packRoot, '..', '..', '..');
const PAYLOAD = 'add/container/skills/knowledge-inventory/SKILL.md';

const installer = readFileSync(join(packRoot, 'SKILL.md'), 'utf8');
const remove = readFileSync(join(packRoot, 'REMOVE.md'), 'utf8');

// ---------------------------------------------------------------------------
// A2 — Pack install / remove wiring
// ---------------------------------------------------------------------------
describe('A2 — pack install/remove wiring', () => {
  it('A2.1 installer has a fork-level section with all four steps', () => {
    expect(installer).toMatch(/fork-level/i);
    // guard → copy in → activate → report
    expect(installer).toMatch(/### 5a — Guard/);
    expect(installer).toMatch(/### 5b — Copy the skill into `container\/skills\/`/);
    expect(installer).toMatch(/### 5c — Activate/);
    expect(installer).toMatch(/blast radius/i);
  });

  it('A2.1b the installer tells the operator to restart', () => {
    // Activation is spawn-time, so restart is the whole step. Asserted as the
    // positive DO step, never as a "no rebuild needed" non-step
    // (skill-guidelines anti-pattern #7).
    expect(installer).toMatch(/Restart activates the tip/);
    expect(installer).toMatch(/ncl groups restart --id/);
  });

  it('A2.1c core still resolves skills at spawn, so restart is sufficient', () => {
    // The load-bearing dependency behind A2.1b: a bare restart only picks the
    // new skill up because core re-reads container/skills/ on every spawn and
    // mounts it in. If upstream ever resolves skills at build time, or drops
    // the mount, restart stops being enough and the installer needs a rebuild
    // step — this must go red then, which is why it reads core's source rather
    // than the installer's prose.
    const runner = readFileSync(join(repoRoot, 'src/container-runner.ts'), 'utf8');

    // (a) container/skills/ is mounted read-only at /app/skills.
    expect(runner).toMatch(/'container',\s*'skills'/);
    expect(runner).toMatch(/containerPath: '\/app\/skills', readonly: true/);

    // (b) an "all" selection is recomputed from the directory listing at spawn,
    // rather than read from stored config — that is what discovers a new dir.
    const selection = runner.slice(runner.indexOf('function selectedSkillNames'));
    expect(selection).toMatch(/containerConfig\.skills !== 'all'/);
    expect(selection).toMatch(/readdirSync/);
  });

  it('A2.2 guard step names both migration conditions', () => {
    const forkSection = installer.slice(installer.indexOf('### 5a — Guard'));
    expect(forkSection).toContain('memory/index.md');
    expect(forkSection).toContain('CLAUDE.local.md');
    expect(forkSection).toMatch(/\/migrate-memory/);
  });

  it('A2.3 install copies from the pack, not from the fork s own git history', () => {
    // Reading the payload out of git made install depend on repo state: from
    // HEAD, re-install broke once an operator committed Part B's removal
    // (`git show HEAD:<path>` had nothing to read); from a branch, it depended
    // on a remote being fetchable and correctly resolved. The pack carries its
    // own payload, so a plain copy works in any checkout, offline, forever.
    expect(installer).toMatch(/rsync -a "\$\{CLAUDE_SKILL_DIR\}\/add\/" \./);
    expect(installer).not.toMatch(/git show/);
    expect(installer).not.toMatch(/git fetch/);
  });

  it('A2.4 only the fork-level remove path deletes the installed skill dir', () => {
    const partA = remove.slice(remove.indexOf('# Part A'), remove.indexOf('# Part B'));
    const partB = remove.slice(remove.indexOf('# Part B'));

    // Per-group removal must never rm the fork-level dir.
    expect(partA).not.toMatch(/rm -rf .*knowledge-inventory/);
    expect(partA).toMatch(/does not remove Knowledge Inventory/i);

    // Fork-level removal does, and skips cleanly when already gone.
    expect(partB).toMatch(/rm -rf container\/skills\/knowledge-inventory/);
    expect(partB).toMatch(/already absent — skipping/);
    expect(partB).toMatch(/explicit full uninstall|last\*{0,2} group/i);
  });

  it('A2.4b remove deletes the installed copy but never the pack s own payload', () => {
    // The canonical copy under add/ is the pack itself. An rm that reached it
    // would make the pack a one-shot: uninstall once, and re-install has
    // nothing left to copy. That is the failure the old branch topology was
    // working around; here it just must not be written.
    expect(remove).not.toMatch(/rm -rf? .*add\/container\/skills/);
    expect(remove).not.toMatch(/rm -rf? .*CLAUDE_SKILL_DIR/);
  });

  it('A2.5 install and remove name the same installed path (no drift)', () => {
    for (const doc of [installer, remove]) {
      expect(doc).toContain('container/skills/knowledge-inventory');
    }
  });

  it('A2.5b trunk ships the tip only under add/, never at a live path', () => {
    // container/skills/ is bind-mounted and rescanned at spawn (A2.1c), so a
    // copy there is live for every group the moment it merges — no one opts in,
    // and Step 5b degenerates into a no-op. The whole two-path layout exists to
    // prevent that, so it is worth a guard.
    expect(existsSync(join(repoRoot, 'container/skills/knowledge-inventory'))).toBe(false);
    expect(existsSync(join(packRoot, PAYLOAD))).toBe(true);
  });

  it('A2.5c the pack actually carries every path the installer copies', () => {
    // Drift protection: the installer copies add/ wholesale, so a payload that
    // went missing or empty would install a skill that silently never loads.
    expect(readFileSync(join(packRoot, PAYLOAD), 'utf8').length).toBeGreaterThan(0);
  });

  it('A2.6 the tip has exactly one canonical copy (no hand-maintained mirror)', () => {
    // docs/skill-guidelines.md anti-pattern #9: a mirror kept in sync by hand
    // drifts. add/ is the single source; the installed copy is derived from it
    // and is not tracked. Asserted from the other side by A2.5b.
    expect(existsSync(join(packRoot, 'assets'))).toBe(false);
    expect(existsSync(join(packRoot, 'container-skills'))).toBe(false);
  });
});
