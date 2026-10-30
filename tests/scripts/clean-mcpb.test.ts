/** MCPB pruning removes dependency guides while retaining executable skills modules. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_DOC_ENTRY, filterAgentDocEntries } from '../../scripts/clean-mcpb.js';

describe('dependency agent documentation pruning', () => {
  it('keeps SDK runtime modules and the published root skill', () => {
    expect(
      filterAgentDocEntries([
        'node_modules/@modelcontextprotocol/server/dist/ext/skills/index.js',
        'node_modules/outer/node_modules/@modelcontextprotocol/server/dist/ext/skills/index.js',
        'skills/tmdb-guide/SKILL.md',
      ]),
    ).toEqual([]);
  });

  it('removes guides at scoped, unscoped, and nested package roots', () => {
    const entries = [
      'node_modules/@cyanheads/mcp-ts-core/framework-skills/add-tool/SKILL.md',
      'node_modules/guide/skills/lookup/SKILL.md',
      'node_modules/outer/node_modules/@owner/guide/.agents/skills/a/SKILL.md',
      'node_modules/guide/SKILL.md',
    ];
    expect(filterAgentDocEntries(entries)).toEqual(entries);
  });

  it('uses the identical selector when verifying bundles', () => {
    const linter = readFileSync(
      new URL('../../scripts/lint-packaging.ts', import.meta.url),
      'utf8',
    );
    expect(linter).toContain(`export const AGENT_DOC_ENTRY =\n  ${AGENT_DOC_ENTRY.toString()};`);
  });
});
