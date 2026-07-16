import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // container/agent-runner tests run under Bun (they depend on bun:sqlite).
    // See container/agent-runner/package.json "test" script.
    // container/*.test.ts: top-level only — container/agent-runner tests run
    // under Bun (they depend on bun:sqlite) and must not be picked up here.
    // .claude/skills/**/tests: an installed skill's own tests (e.g. the
    // adoption pack's pure install-time helper). They live here so `pnpm run
    // test` and CI run them — a suite behind a bespoke --config never runs.
    include: [
      'src/**/*.test.ts',
      'setup/**/*.test.ts',
      'scripts/**/*.test.ts',
      'container/*.test.ts',
      '.claude/skills/**/tests/*.test.ts',
    ],
  },
});
