import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Wiring guards for the Knowledge Inventory companion tip. The feature is zero
// runtime code — a container skill's prose plus the existing send_file /
// send_message tools — so there is no helper to unit-test. These read the
// shipped artifacts and assert the invariants the spec pins down (the same
// idiom as container/agent-runner/src/memory/scaffold.wiring.test.ts): the
// skill's trigger contract, its guard, its no-jargon rule, and the pack's
// two-scope install/remove wiring.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_PATH = 'container/skills/knowledge-inventory/SKILL.md';
const PACK = '.claude/skills/add-adoption-companion';

const skill = readFileSync(join(repoRoot, SKILL_PATH), 'utf8');
const installer = readFileSync(join(repoRoot, PACK, 'SKILL.md'), 'utf8');
const remove = readFileSync(join(repoRoot, PACK, 'REMOVE.md'), 'utf8');

// Terms that describe storage internals. Fine in behavioral prose (the agent
// has to be told what to read); never in a string the user is shown.
const JARGON = [
  'memory/',
  'index.md',
  'concept file',
  'OKF',
  'entity type',
  'frontmatter',
  'Core Memory',
  'CLAUDE.local.md',
  '/workspace',
  // Added after a live eval: an agent said "my memory's still just the empty
  // scaffold" on an empty group. Not in the spec's blocklist, but it is
  // storage vocabulary reaching the user. See evals/knowledge-inventory/RESULTS.md.
  'scaffold',
];

/** Example output = a ```text example-output fence. Those are shown to users. */
function exampleOutputs(md: string): string[] {
  return [...md.matchAll(/```text example-output\n([\s\S]*?)```/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// A1 — SKILL.md invariants
// ---------------------------------------------------------------------------
describe('A1 — knowledge-inventory SKILL.md', () => {
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';

  it('A1.1 has frontmatter with the right name and a description', () => {
    expect(frontmatter).toMatch(/^name: knowledge-inventory$/m);
    expect(frontmatter).toMatch(/^description: \S.+/m);
  });

  it('A1.2 description names the reactive triggers (this is what model-invokes it)', () => {
    const description = frontmatter.match(/^description: (.+)$/m)?.[1] ?? '';
    for (const trigger of ['what you know', 'remember', 'track']) {
      expect(description.toLowerCase()).toContain(trigger);
    }
  });

  it('A1.3 guards on the active store and degrades honestly', () => {
    expect(skill).toContain('memory/index.md');
    // Forward-to-operator phrasing, never "run this yourself".
    expect(skill).toMatch(/forward|pass this to whoever set me up/i);
    expect(skill).toMatch(/do \*\*not\*\* improvise|do not improvise/i);
  });

  it('A1.4 reads Core Memory + walks folder indexes, and counts rather than invents', () => {
    expect(skill).toMatch(/Core Memory/);
    expect(skill).toMatch(/walk the folder .*index\.md/i);
    expect(skill).toMatch(/count.*from the folders/i);
    expect(skill).toMatch(/never estimate, round, or infer/i);
  });

  it('A1.5 carries the translation rules and the no-jargon rule', () => {
    expect(skill).toMatch(/About you/);
    expect(skill).toMatch(/user's (vocabulary|words)/i);
    expect(skill).toMatch(/Your customers — 12/);
    // The no-jargon rule must enumerate the blocklist for the agent.
    expect(skill).toMatch(/Never say, in any surface/i);
    for (const term of ['concept file', 'OKF', 'entity type', 'frontmatter']) {
      expect(skill).toContain(term);
    }
  });

  it('A1.5b states no-jargon as a principle, not just a word list', () => {
    // Regression: "scaffold" leaked past an enumerated blocklist on a live run,
    // because a list can only ban words someone thought of. The skill must
    // carry the generative rule too.
    expect(skill).toMatch(/list is examples, not the whole rule/i);
    expect(skill).toMatch(/no word that describes how your memory is built/i);
    expect(skill).toContain('scaffold');
  });

  it('A1.5c requires every mapped folder to be reported, except system/', () => {
    // Regression: a live run silently dropped an operational folder (context/)
    // from the inventory. Spec §2 says report the categories the map points at;
    // system/ (the memory's own definition) is the one legitimate exclusion.
    expect(skill).toMatch(/Report every folder the map points at/i);
    expect(skill).toMatch(/system\//);
    expect(skill).toMatch(/[Dd]on't silently drop a category/);
  });

  it('A1.6 names both rendering surfaces', () => {
    expect(skill).toContain('send_file');
    expect(skill).toMatch(/self-contained/i);
    expect(skill).toMatch(/no external (stylesheets|assets)/i);
    expect(skill).toContain('send_message');
    expect(skill).toMatch(/plain text.*always available/i);
  });

  it('A1.7 offers control (add / fix / stop tracking)', () => {
    expect(skill).toMatch(/add something, fix anything, or stop tracking/i);
    expect(skill).toContain('system/definition.md');
  });

  it('A1.8 no jargon in user-facing example strings', () => {
    const examples = exampleOutputs(skill);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      for (const term of JARGON) {
        expect(example).not.toContain(term);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// A2 — Pack install / remove wiring
// ---------------------------------------------------------------------------
describe('A2 — pack install/remove wiring', () => {
  it('A2.1 installer has a fork-level section with all four steps', () => {
    expect(installer).toMatch(/fork-level/i);
    // guard → ensure present → activate → report
    expect(installer).toMatch(/### 5a — Guard/);
    expect(installer).toMatch(/### 5b — Ensure the skill directory is present/);
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

  it('A2.3 install is idempotent by construction (present → confirm, absent → restore)', () => {
    expect(installer).toMatch(/if \[ -f container\/skills\/knowledge-inventory\/SKILL\.md \]/);
    expect(installer).toMatch(/already present/);
    // Restore-from-git is what makes a post-uninstall re-install work.
    expect(installer).toMatch(/git show HEAD:container\/skills\/knowledge-inventory\/SKILL\.md/);
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

  it('A2.5 paths in the installer match the skill s actual location (no drift)', () => {
    expect(existsSync(join(repoRoot, SKILL_PATH))).toBe(true);
    expect(installer).toContain('container/skills/knowledge-inventory');
    expect(remove).toContain('container/skills/knowledge-inventory');
  });

  it('A2.6 the skill has exactly one canonical copy (no hand-maintained mirror)', () => {
    // docs/skill-guidelines.md anti-pattern #9: a mirror kept in sync by hand
    // drifts. The tracked file IS the source; install restores it from git
    // (the add-slack idiom), so there is no second copy to guard.
    expect(existsSync(join(repoRoot, PACK, 'assets'))).toBe(false);
    expect(installer).not.toMatch(/cp .*assets.*knowledge-inventory/);
  });
});
