import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // container/agent-runner tests run under Bun (they depend on bun:sqlite).
    // See container/agent-runner/package.json "test" script.
    // container/*.test.ts: top-level only — container/agent-runner tests run
    // under Bun (they depend on bun:sqlite) and must not be picked up here.
    // .claude/skills/**/tests: a skill's own tests, for skills that keep code
    // in the skill directory rather than copying it into src/ on install.
    include: [
      'src/**/*.test.ts',
      'setup/**/*.test.ts',
      'scripts/**/*.test.ts',
      'container/*.test.ts',
      '.claude/skills/**/tests/*.test.ts',
    ],
  },
});
