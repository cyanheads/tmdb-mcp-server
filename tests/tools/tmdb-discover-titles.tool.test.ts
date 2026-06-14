/**
 * @fileoverview Tests for tmdb_discover_titles — headline filtered discovery, the
 * region_required contract, no-op notices for inapplicable params, empty-result
 * guidance, and format completeness.
 * @module tests/tools/tmdb-discover-titles.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
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

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbDiscoverTitles', () => {
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
      code: JsonRpcErrorCode.InvalidParams,
      data: { reason: 'region_required' },
    });
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
