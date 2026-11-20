/**
 * @fileoverview Tests for tmdb_get_season — headline episode list, series_id echo,
 * guest stars, season_not_found contract, and format completeness.
 * @module tests/tools/tmdb-get-season.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, getEnrichment, runToolContract } from '@cyanheads/mcp-ts-core/testing';
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
  it('returns episode metadata and curated crew by default and guest stars only on request', async () => {
    await initServiceForTools({
      '/tv/1396/season/5': {
        ...BB_S1,
        season_number: 5,
        episodes: [
          {
            episode_number: 12,
            name: 'Without directing or writing credits',
            crew: [{ id: 8, name: 'Producer Only', job: 'Producer' }],
          },
          { episode_number: 13, name: 'Sparse' },
          {
            episode_number: 14,
            id: 62162,
            name: 'Ozymandias',
            vote_count: 0,
            episode_type: 'future type',
            crew: [
              { id: 1, name: 'Rian Johnson', job: 'Director' },
              { id: 2, name: 'Skip Me', job: 'Producer' },
              { id: 3, name: 'Moira Walley-Beckett', job: 'Writer' },
              { id: 4, name: 'Teleplay Credit', job: 'Teleplay' },
              { id: 5, name: 'Story Credit', job: 'Story' },
            ],
            guest_stars: [
              { id: 6, name: 'Guest One' },
              { id: 7, name: 'Guest Two' },
            ],
          },
        ],
      },
    });
    const args = { series_id: 1396, season_number: 5, language: 'fr-FR' };
    const fetch = vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout');
    try {
      const result = await runToolContract(tmdbGetSeason, args);
      const data = tmdbGetSeason.output.loose().parse(result.structuredContent);
      const expectedEpisodes = [
        { episode_number: 12, name: 'Without directing or writing credits', crew: [] },
        { episode_number: 13, name: 'Sparse' },
        {
          episode_number: 14,
          id: 62162,
          name: 'Ozymandias',
          vote_count: 0,
          episode_type: 'future type',
          crew: [
            { id: 1, name: 'Rian Johnson', job: 'Director' },
            { id: 3, name: 'Moira Walley-Beckett', job: 'Writer' },
            { id: 4, name: 'Teleplay Credit', job: 'Teleplay' },
            { id: 5, name: 'Story Credit', job: 'Story' },
          ],
        },
      ];
      expect(data.episodes).toEqual(expectedEpisodes);
      const text = JSON.stringify(result.content);
      for (const term of [
        'id 62162',
        '0 votes',
        'future type',
        'Rian Johnson',
        'Moira Walley-Beckett',
        'Bryan Cranston',
      ]) {
        expect(text).toContain(term);
      }
      expect(text).toContain('**Crew:** None');
      expect(text).not.toMatch(/Guest One|Guest Two|Skip Me|Producer Only/);

      const explicitFalse = await runToolContract(tmdbGetSeason, {
        ...args,
        include_guest_stars: false,
      });
      expect(explicitFalse).toEqual(result);
      const guests = await runToolContract(tmdbGetSeason, { ...args, include_guest_stars: true });
      expect(guests.structuredContent).toEqual({
        ...data,
        episodes: [
          expectedEpisodes[0],
          expectedEpisodes[1],
          {
            ...expectedEpisodes[2],
            guest_stars: [
              { id: 6, name: 'Guest One' },
              { id: 7, name: 'Guest Two' },
            ],
          },
        ],
      });
      expect(JSON.stringify(guests.content)).toContain('Guest One');
      expect(JSON.stringify(guests.content)).toContain('Guest Two');
      expect(fetch).toHaveBeenCalledTimes(3);
      for (const [request] of fetch.mock.calls) {
        expect(new URL(String(request)).searchParams.get('language')).toBe('fr-FR');
      }
    } finally {
      fetch.mockRestore();
    }
  });
  it('returns the episode list and echoes series_id (headline path)', async () => {
    await initServiceForTools({ '/tv/1396/season/1': BB_S1 });
    const ctx = createMockContext({ errors: tmdbGetSeason.errors });
    const input = tmdbGetSeason.input.parse({
      series_id: 1396,
      season_number: 1,
      include_guest_stars: true,
    });
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

  it('rejects invalid inputs and preserves season_not_found recovery on both surfaces', async () => {
    await initServiceForTools();
    for (const input of [
      { series_id: 1396, season_number: -1 },
      { series_id: 1396, season_number: 0, include_guest_stars: 'sometimes' },
    ]) {
      const result = await runToolContract<Parameters<typeof runToolContract>[0]>(
        tmdbGetSeason,
        input,
      );
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.structuredContent)).toContain('-32602');
    }
    throwForPath('/tv/1396/season/99', JsonRpcErrorCode.NotFound);
    const missing = await runToolContract(tmdbGetSeason, {
      series_id: 1396,
      season_number: 99,
    });
    expect(missing.isError).toBe(true);
    for (const surface of [missing.structuredContent, missing.content]) {
      expect(JSON.stringify(surface)).toContain('season_not_found');
      expect(JSON.stringify(surface)).toContain('tmdb_get_show');
    }
  });

  it('returns an empty specials episode list as success', async () => {
    await initServiceForTools({ '/tv/1396/season/0': { season_number: 0, name: 'Specials' } });
    const result = await runToolContract(tmdbGetSeason, { series_id: 1396, season_number: 0 });
    expect(result.structuredContent).toMatchObject({ season_number: 0, episodes: [] });
    expect(JSON.stringify(result.content)).toContain('episodes:** 0');
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
