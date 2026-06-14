/**
 * @fileoverview Tests for tmdb_get_trending — headline trending list (mixed media),
 * attribution + total enrichment, and format completeness.
 * @module tests/tools/tmdb-get-trending.tool.test
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

const { tmdbGetTrending } = await import(
  '@/mcp-server/tools/definitions/tmdb-get-trending.tool.js'
);

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbGetTrending', () => {
  it('returns a mixed trending list with resolved fields (headline path)', async () => {
    await initServiceForTools({
      '/trending/all/week': {
        page: 1,
        total_pages: 100,
        total_results: 2000,
        results: [
          {
            id: 550,
            media_type: 'movie',
            title: 'Fight Club',
            vote_average: 8.4,
            genre_ids: [18],
            poster_path: '/p.jpg',
          },
          { id: 287, media_type: 'person', name: 'Brad Pitt', profile_path: '/b.jpg' },
        ],
      },
    });
    const ctx = createMockContext();
    const input = tmdbGetTrending.input.parse({});
    const result = await tmdbGetTrending.handler(input, ctx);

    expect(result.total_results).toBe(2000);
    expect(result.results[0]).toMatchObject({
      id: 550,
      media_type: 'movie',
      genre_names: ['Drama'],
    });
    expect(result.results[1]).toMatchObject({ id: 287, media_type: 'person' });
    expect(result.results[1]?.profile_url).toBe('https://image.tmdb.org/t/p/w185/b.jpg');
    expect(result).toEqual(expect.schemaMatching(tmdbGetTrending.output));
    expect(getEnrichment(ctx).totalCount).toBe(2000);
  });

  it('honors the day window and movie media_type', async () => {
    await initServiceForTools({
      '/trending/movie/day': {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 1, title: 'Today' }],
      },
    });
    const ctx = createMockContext();
    const input = tmdbGetTrending.input.parse({ media_type: 'movie', time_window: 'day' });
    const result = await tmdbGetTrending.handler(input, ctx);
    expect(result.results[0]).toMatchObject({ id: 1, media_type: 'movie' });
  });

  it('format() renders trending items', () => {
    const blocks = tmdbGetTrending.format!({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 550, media_type: 'movie', title: 'Fight Club', vote_average: 8.4 }],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Fight Club');
    expect(text).toContain('id 550');
  });
});
