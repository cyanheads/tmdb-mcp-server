/**
 * @fileoverview Tests for tmdb_get_season — headline episode list, series_id echo,
 * guest stars, season_not_found contract, and format completeness.
 * @module tests/tools/tmdb-get-season.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initServiceForTools,
  mockFetchWithTimeout,
  STARTUP_ROUTES,
  setRoutes,
  throwForPath,
} from '../helpers/mock-tmdb.js';

vi.mock('@cyanheads/mcp-ts-core/utils', async (importActual) => {
  const actual = await importActual<typeof import('@cyanheads/mcp-ts-core/utils')>();
  return { ...actual, fetchWithTimeout: mockFetchWithTimeout };
});

const { tmdbGetSeason } = await import('@/mcp-server/tools/definitions/tmdb-get-season.tool.js');

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

const BB_S1 = {
  id: 3572,
  name: 'Season 1',
  season_number: 1,
  air_date: '2008-01-20',
  vote_average: 8.3,
  poster_path: '/s1.jpg',
  episodes: [
    {
      episode_number: 1,
      name: 'Pilot',
      overview: 'Walter White, a chemistry teacher...',
      air_date: '2008-01-20',
      runtime: 58,
      vote_average: 8.9,
      still_path: '/still.jpg',
      guest_stars: [{ id: 92495, name: 'John Koyama', character: 'Emilio', order: 0 }],
    },
  ],
  credits: { cast: [{ id: 17419, name: 'Bryan Cranston', character: 'Walter White', order: 0 }] },
};

describe('tmdbGetSeason', () => {
  it('returns the episode list and echoes series_id (headline path)', async () => {
    await initServiceForTools({ '/tv/1396/season/1': BB_S1 });
    const ctx = createMockContext({ errors: tmdbGetSeason.errors });
    const input = tmdbGetSeason.input.parse({ series_id: 1396, season_number: 1 });
    const season = await tmdbGetSeason.handler(input, ctx);

    expect(season.series_id).toBe(1396); // echoed — not in the API response
    expect(season.season_number).toBe(1);
    expect(season.episodes).toHaveLength(1);
    expect(season.episodes[0]).toMatchObject({
      episode_number: 1,
      name: 'Pilot',
      runtime_minutes: 58,
    });
    expect(season.episodes[0]?.guest_stars?.[0]?.name).toBe('John Koyama');
    expect(season.regular_cast?.[0]?.name).toBe('Bryan Cranston');
    expect(season).toEqual(expect.schemaMatching(tmdbGetSeason.output));
    expect(getEnrichment(ctx).attribution).toContain('TMDB API');
  });

  it('throws season_not_found on a 404', async () => {
    await initServiceForTools();
    throwForPath('/tv/1396/season/99', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({ errors: tmdbGetSeason.errors });
    const input = tmdbGetSeason.input.parse({ series_id: 1396, season_number: 99 });
    await expect(tmdbGetSeason.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'season_not_found' },
    });
  });

  it('format() renders episodes with guest stars', () => {
    const blocks = tmdbGetSeason.format!({
      series_id: 1396,
      season_number: 1,
      name: 'Season 1',
      episodes: [
        {
          episode_number: 1,
          name: 'Pilot',
          air_date: '2008-01-20',
          runtime_minutes: 58,
          guest_stars: [{ id: 92495, name: 'John Koyama', character: 'Emilio' }],
        },
      ],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('series 1396');
    expect(text).toContain('Pilot');
    expect(text).toContain('John Koyama');
  });
});
