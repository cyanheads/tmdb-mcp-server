/**
 * @fileoverview Tests for tmdb_discover_titles — headline filtered discovery, the
 * region_required contract, no-op notices for inapplicable params, empty-result
 * guidance, and format completeness.
 * @module tests/tools/tmdb-discover-titles.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, getEnrichment, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initServiceForTools,
  mockFetchWithTimeout,
  STARTUP_ROUTES,
  setRoutes,
} from '../helpers/mock-tmdb.js';

vi.mock('@cyanheads/mcp-ts-core/utils', async (importActual) => {
  const actual = await importActual<typeof import('@cyanheads/mcp-ts-core/utils')>();
  return { ...actual, fetchWithTimeout: mockFetchWithTimeout };
});

const { tmdbDiscoverTitles } = await import(
  '@/mcp-server/tools/definitions/tmdb-discover-titles.tool.js'
);
const { tmdbSearchTitles } = await import(
  '@/mcp-server/tools/definitions/tmdb-search-titles.tool.js'
);
const { tmdbGetTrending } = await import(
  '@/mcp-server/tools/definitions/tmdb-get-trending.tool.js'
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbDiscoverTitles', () => {
  it.each([
    ['search', tmdbSearchTitles, { query: 'zzxqq', page: 3 }, '/search/multi', 'No results'],
    ['discover', tmdbDiscoverTitles, { media_type: 'tv', page: 3 }, '/discover/tv', 'No results'],
    ['trending', tmdbGetTrending, { page: 3 }, '/trending/all/week', 'No trending results'],
  ] as const)(
    '%s preserves empty and populated pagination on both surfaces',
    async (_name, definition, input, route, emptyText) => {
      for (const total_pages of [0, 1]) {
        await initServiceForTools({
          [route]: { page: 3, total_pages, total_results: 0, results: [] },
        });
        const result = await runToolContract(definition, input);
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          page: 3,
          total_pages,
          total_results: 0,
          totalCount: 0,
        });
        const text = result.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        expect(text).toContain(emptyText);
        expect(text).toContain(`page 3/${total_pages}`);
        expect(text).toContain('TMDB API');
        expect(text).toContain(
          String((result.structuredContent as Record<string, unknown>).notice),
        );
      }
      await initServiceForTools({
        [route]: {
          page: 3,
          total_pages: 4,
          total_results: 61,
          results: [{ id: 42, media_type: 'tv', name: 'A show' }],
        },
      });
      const populated = await runToolContract(definition, input);
      expect(populated.isError).not.toBe(true);
      expect(populated.structuredContent).toMatchObject({
        page: 3,
        total_pages: 4,
        total_results: 61,
      });
      expect(JSON.stringify(populated.content)).toContain('page 3/4');
      expect(JSON.stringify(populated.content)).toContain('A show');
      expect(JSON.stringify(populated.content)).toContain('id 42');
    },
  );
  it.each(['revenue.asc', 'revenue.desc'] as const)(
    'discloses TV %s fallback on both surfaces',
    async (sort_by) => {
      await initServiceForTools({
        '/discover/tv': { page: 1, total_pages: 0, total_results: 0, results: [] },
      });
      const result = await runToolContract(tmdbDiscoverTitles, {
        media_type: 'tv',
        sort_by,
        with_cast: [1],
        with_crew: [2],
      });
      const text = JSON.stringify(result.content);
      expect(result.structuredContent).toMatchObject({ page: 1, total_results: 0 });
      for (const fragment of [
        'popularity.desc',
        'movie-only',
        'with_cast and with_crew',
        'No titles matched',
      ]) {
        expect(text).toContain(fragment);
        expect(JSON.stringify(result.structuredContent)).toContain(fragment);
      }
    },
  );
  it('returns filtered, sorted results (headline path)', async () => {
    await initServiceForTools({
      '/discover/movie': {
        page: 1,
        total_pages: 50,
        total_results: 1000,
        results: [
          {
            id: 550,
            title: 'Fight Club',
            vote_average: 8.4,
            vote_count: 27000,
            genre_ids: [18],
            popularity: 60,
          },
        ],
      },
    });
    const ctx = createMockContext({ errors: tmdbDiscoverTitles.errors });
    const input = tmdbDiscoverTitles.input.parse({
      media_type: 'movie',
      sort_by: 'vote_average.desc',
      with_genres: [18],
      vote_count_gte: 1000,
    });
    const result = await tmdbDiscoverTitles.handler(input, ctx);

    expect(result.total_results).toBe(1000);
    expect(result.results[0]).toMatchObject({
      id: 550,
      media_type: 'movie',
      genre_names: ['Drama'],
    });
    expect(result).toEqual(expect.schemaMatching(tmdbDiscoverTitles.output));
    expect(getEnrichment(ctx).totalCount).toBe(1000);
  });

  it('throws region_required when with_watch_providers lacks a region', async () => {
    await initServiceForTools();
    const ctx = createMockContext({ errors: tmdbDiscoverTitles.errors });
    const input = tmdbDiscoverTitles.input.parse({
      media_type: 'movie',
      with_watch_providers: [8],
    });
    await expect(tmdbDiscoverTitles.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      data: { reason: 'region_required' },
    });
  });

  it.each(['GB', 'DE'])(
    'uses configured %s only as a recovery example on both surfaces',
    async (region) => {
      vi.stubEnv('TMDB_DEFAULT_REGION', region);
      await initServiceForTools();
      for (const watch_region of [undefined, '']) {
        const result = await runToolContract(tmdbDiscoverTitles, {
          media_type: 'tv',
          with_watch_providers: [8],
          watch_region,
        });
        expect(result.isError).toBe(true);
        const hint = `Provide watch_region (ISO 3166-1, e.g. watch_region: "${region}") — streaming availability is region-specific and cannot be queried globally.`;
        expect(result.structuredContent).toMatchObject({
          error: {
            code: JsonRpcErrorCode.ValidationError,
            data: { reason: 'region_required', recovery: { hint } },
          },
        });
        const text = result.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        expect(text).toContain(hint);
      }
    },
  );

  it('keeps a concrete recovery on a direct handler error', async () => {
    // Direct callers receive the runtime hint as well as the framework envelope.
    await initServiceForTools();
    const declared = tmdbDiscoverTitles.errors?.find((e) => e.reason === 'region_required');
    expect(declared?.recovery).toBeTypeOf('string');

    const ctx = createMockContext({ errors: tmdbDiscoverTitles.errors });
    const input = tmdbDiscoverTitles.input.parse({
      media_type: 'tv',
      with_watch_providers: [8],
      watch_region: '',
    });
    await expect(tmdbDiscoverTitles.handler(input, ctx)).rejects.toMatchObject({
      data: {
        reason: 'region_required',
        recovery: { hint: expect.stringContaining('watch_region') },
      },
    });
  });

  it('forwards only caller-selected regions and allows no provider filter', async () => {
    vi.stubEnv('TMDB_DEFAULT_REGION', 'DE');
    await initServiceForTools({ '/discover/movie': { results: [] } });
    const fetch = vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout');
    const explicit = await runToolContract(tmdbDiscoverTitles, {
      media_type: 'movie',
      with_watch_providers: [8],
      watch_region: 'GB',
    });
    expect(explicit.isError).not.toBe(true);
    expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).searchParams.get('watch_region')).toBe(
      'GB',
    );
    for (const with_watch_providers of [undefined, []]) {
      const result = await runToolContract(tmdbDiscoverTitles, {
        media_type: 'movie',
        with_watch_providers,
      });
      expect(result.isError).not.toBe(true);
      expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).searchParams.has('watch_region')).toBe(
        false,
      );
    }
    fetch.mockClear();
    await runToolContract(tmdbDiscoverTitles, { media_type: 'movie', with_watch_providers: [8] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('notices that with_networks is ignored for movie', async () => {
    await initServiceForTools({
      '/discover/movie': {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 1, title: 'X' }],
      },
    });
    const ctx = createMockContext({ errors: tmdbDiscoverTitles.errors });
    const input = tmdbDiscoverTitles.input.parse({ media_type: 'movie', with_networks: [213] });
    await tmdbDiscoverTitles.handler(input, ctx);
    expect(String(getEnrichment(ctx).notice)).toContain('with_networks');
  });

  it('emits guidance when no titles match', async () => {
    await initServiceForTools({
      '/discover/tv': { page: 1, total_pages: 0, total_results: 0, results: [] },
    });
    const ctx = createMockContext({ errors: tmdbDiscoverTitles.errors });
    const input = tmdbDiscoverTitles.input.parse({ media_type: 'tv', vote_count_gte: 99999 });
    const result = await tmdbDiscoverTitles.handler(input, ctx);
    expect(result.results).toEqual([]);
    expect(String(getEnrichment(ctx).notice)).toContain('vote_count_gte');
  });

  it('format() renders results', () => {
    const blocks = tmdbDiscoverTitles.format!({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [
        {
          id: 550,
          media_type: 'movie',
          title: 'Fight Club',
          vote_average: 8.4,
          genre_names: ['Drama'],
        },
      ],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Fight Club');
    expect(text).toContain('id 550');
  });
});
