import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Install/remove wiring guards for the Knowledge Inventory companion tip.
//
// The tip itself is NOT in trunk — it lives on the `adoption-companion` branch
// and /add-adoption-companion copies it in (the `channels`/slack-formatting
// topology). Its content invariants therefore travel with it, in
// container/knowledge-inventory.skill.test.ts on that branch; there would be
// nothing to read here. What trunk owns, and what this file guards, is the
// pack's two-scope install/remove wiring and the core behavior that wiring
// depends on.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = '.claude/skills/add-adoption-companion';
const BRANCH = 'adoption-companion';

const installer = readFileSync(join(repoRoot, PACK, 'SKILL.md'), 'utf8');
const remove = readFileSync(join(repoRoot, PACK, 'REMOVE.md'), 'utf8');

// ---------------------------------------------------------------------------
// A2 — Pack install / remove wiring
// ---------------------------------------------------------------------------
describe('A2 — pack install/remove wiring', () => {
  it('A2.1 installer has a fork-level section with all four steps', () => {
    expect(installer).toMatch(/fork-level/i);
    // guard → ensure present → activate → report
    expect(installer).toMatch(/### 5a — Guard/);
    expect(installer).toMatch(/### 5b — Copy the skill in from the `adoption-companion` branch/);
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

  it('A2.3 install copies from the branch, not from the fork s own history', () => {
    // Reading the payload from HEAD made re-install depend on the user's trunk
    // state: after Part B removed the file and the operator committed that,
    // `git show HEAD:<path>` had nothing to read. The branch is independent of
    // trunk, so this holds no matter what the fork's history looks like.
    expect(installer).toMatch(/git fetch "\$REMOTE" "\$BRANCH"/);
    expect(installer).toMatch(/BRANCH=adoption-companion/);
    expect(installer).not.toMatch(/git show HEAD:/);
  });

  it('A2.3b install writes via a temp path, so a failed fetch cannot truncate', () => {
    // `git show <bad-ref> > dest` leaves a 0-byte dest: the shell creates the
    // file before git runs and fails. A 0-byte SKILL.md is a skill that never
    // loads, and the old `-f` guard then reported it as already installed.
    expect(installer).toMatch(/> "\$p\.tmp" && mv "\$p\.tmp" "\$p"/);
  });

  it('A2.3c the remote resolver does not hardcode origin', () => {
    // A fork clone carries the branch on origin, but a checkout with an
    // upstream remote does not — resolve by which remote actually has it.
    expect(installer).toMatch(/git ls-remote --heads "\$r" "\$BRANCH"/);
    expect(installer).toMatch(/NANOCLAW_CHANNELS_REMOTE/);
  });

  it('A2.4 only the fork-level remove path deletes the skill dir', () => {
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

  it('A2.5 install and remove name the same paths (no drift between the two)', () => {
    for (const doc of [installer, remove]) {
      expect(doc).toContain('container/skills/knowledge-inventory');
      expect(doc).toContain('container/knowledge-inventory.skill.test.ts');
    }
  });

  it('A2.5b trunk does not ship the tip — the branch is what carries it', () => {
    // If this file ever reappears in trunk, the install step becomes a no-op
    // and the tip goes live fork-wide at merge, with no one opting in. That is
    // the state this whole topology exists to prevent, so it is worth a guard.
    expect(existsSync(join(repoRoot, 'container/skills/knowledge-inventory'))).toBe(false);
  });

  it('A2.5c the branch actually carries every path the installer copies', () => {
    // Real drift protection: the installer names paths on a branch nothing in
    // trunk can typecheck. Only runs where the ref is available (it is not in a
    // fresh shallow clone), so a missing branch skips rather than fails red.
    const ref = [`${BRANCH}`, `fork/${BRANCH}`, `origin/${BRANCH}`].find((r) => {
      try {
        execFileSync('git', ['rev-parse', '--verify', '--quiet', r], { cwd: repoRoot, stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    });
    if (!ref) return; // branch not fetched here — nothing to check against

    for (const p of ['container/skills/knowledge-inventory/SKILL.md', 'container/knowledge-inventory.skill.test.ts']) {
      expect(installer).toContain(p);
      const blob = execFileSync('git', ['cat-file', '-p', `${ref}:${p}`], { cwd: repoRoot, stdio: 'pipe' }).toString();
      expect(blob.length).toBeGreaterThan(0);
    }
  });

  it('A2.6 the skill has exactly one canonical copy (no hand-maintained mirror)', () => {
    // docs/skill-guidelines.md anti-pattern #9: a mirror kept in sync by hand
    // drifts. The branch IS the source and install copies from it (the
    // add-slack idiom), so there is no second copy to guard.
    expect(existsSync(join(repoRoot, PACK, 'assets'))).toBe(false);
    expect(installer).not.toMatch(/cp .*assets.*knowledge-inventory/);
  });
});
