/**
 * @fileoverview Tests for tmdb_search_titles — headline name→id resolution, empty-result
 * notice, attribution enrichment, and format completeness.
 * @module tests/tools/tmdb-search-titles.tool.test
 */

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

const { tmdbSearchTitles } = await import(
  '@/mcp-server/tools/definitions/tmdb-search-titles.tool.js'
);

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbSearchTitles', () => {
  it('resolves a name to ranked results with ids (headline path)', async () => {
    await initServiceForTools({
      '/search/multi': {
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [
          {
            id: 550,
            media_type: 'movie',
            title: 'Fight Club',
            release_date: '1999-10-15',
            vote_average: 8.4,
            genre_ids: [18],
            poster_path: '/p.jpg',
          },
          {
            id: 287,
            media_type: 'person',
            name: 'Brad Pitt',
            profile_path: '/b.jpg',
            known_for_department: 'Acting',
          },
        ],
      },
    });

    const ctx = createMockContext();
    const input = tmdbSearchTitles.input.parse({ query: 'fight club' });
    const result = await tmdbSearchTitles.handler(input, ctx);

    expect(result.total_results).toBe(2);
    expect(result.results.map((r) => r.id)).toEqual([550, 287]);
    expect(result.results[0]).toMatchObject({
      media_type: 'movie',
      release_year: 1999,
      genre_names: ['Drama'],
    });
    expect(result.results[1]).toMatchObject({
      media_type: 'person',
      known_for_department: 'Acting',
    });
    expect(result).toEqual(expect.schemaMatching(tmdbSearchTitles.output));

    const enrichment = getEnrichment(ctx);
    expect(enrichment.attribution).toContain('TMDB API');
    expect(enrichment.totalCount).toBe(2);
  });

  it('emits an empty-result notice when nothing matches', async () => {
    await initServiceForTools({
      '/search/movie': { page: 1, total_pages: 1, total_results: 0, results: [] },
    });
    const ctx = createMockContext();
    const input = tmdbSearchTitles.input.parse({ query: 'zzxqq', mode: 'movie' });
    const result = await tmdbSearchTitles.handler(input, ctx);

    expect(result.results).toEqual([]);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.totalCount).toBe(0);
    expect(String(enrichment.notice)).toContain('zzxqq');
  });

  it('propagates an upstream failure (non-OK throws)', async () => {
    await initServiceForTools(); // no /search route → mock throws NotFound
    const ctx = createMockContext();
    const input = tmdbSearchTitles.input.parse({ query: 'anything', mode: 'movie' });
    await expect(tmdbSearchTitles.handler(input, ctx)).rejects.toThrow();
  });

  it('format() renders ids, types, and image URLs', () => {
    const blocks = tmdbSearchTitles.format!({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [
        {
          id: 550,
          media_type: 'movie',
          title: 'Fight Club',
          release_year: 1999,
          vote_average: 8.4,
          genre_names: ['Drama'],
          poster_url: 'https://image.tmdb.org/t/p/w500/p.jpg',
        },
      ],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Fight Club');
    expect(text).toContain('id 550');
    expect(text).toContain('movie');
    expect(text).toContain('https://image.tmdb.org/t/p/w500/p.jpg');
  });
});
