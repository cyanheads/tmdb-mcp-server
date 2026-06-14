/**
 * @fileoverview Tests for tmdb_get_show — headline detail with seasons/networks/content
 * rating, show_not_found contract, and format completeness.
 * @module tests/tools/tmdb-get-show.tool.test
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

const { tmdbGetShow } = await import('@/mcp-server/tools/definitions/tmdb-get-show.tool.js');

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

const BREAKING_BAD = {
  id: 1396,
  name: 'Breaking Bad',
  overview: 'A high school chemistry teacher...',
  status: 'Ended',
  first_air_date: '2008-01-20',
  last_air_date: '2013-09-29',
  number_of_seasons: 5,
  number_of_episodes: 62,
  episode_run_time: [45],
  genres: [{ id: 18, name: 'Drama' }],
  vote_average: 8.9,
  vote_count: 13000,
  popularity: 300,
  in_production: false,
  type: 'Scripted',
  poster_path: '/bb.jpg',
  created_by: [{ id: 66633, name: 'Vince Gilligan', profile_path: '/vg.jpg' }],
  networks: [{ id: 174, name: 'AMC', logo_path: '/amc.png', origin_country: 'US' }],
  seasons: [
    {
      season_number: 1,
      name: 'Season 1',
      episode_count: 7,
      air_date: '2008-01-20',
      poster_path: '/s1.jpg',
    },
  ],
  last_episode_to_air: {
    id: 62,
    name: 'Felina',
    season_number: 5,
    episode_number: 16,
    air_date: '2013-09-29',
    vote_average: 9.4,
  },
  credits: {
    cast: [{ id: 17419, name: 'Bryan Cranston', character: 'Walter White', order: 0 }],
    crew: [],
  },
  videos: { results: [] },
  recommendations: { results: [] },
  similar: { results: [] },
  keywords: { results: [{ id: 1, name: 'drugs' }] },
  external_ids: { imdb_id: 'tt0903747' },
  content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] },
};

describe('tmdbGetShow', () => {
  it('fetches full show detail (headline path)', async () => {
    await initServiceForTools({ '/tv/1396': BREAKING_BAD });
    const ctx = createMockContext({ errors: tmdbGetShow.errors });
    const input = tmdbGetShow.input.parse({ series_id: 1396 });
    const show = await tmdbGetShow.handler(input, ctx);

    expect(show).toMatchObject({
      id: 1396,
      name: 'Breaking Bad',
      number_of_seasons: 5,
      number_of_episodes: 62,
      us_content_rating: 'TV-MA',
      in_production: false,
    });
    expect(show.created_by?.[0]?.name).toBe('Vince Gilligan');
    expect(show.networks?.[0]?.name).toBe('AMC');
    expect(show.seasons[0]?.season_number).toBe(1);
    expect(show.last_episode_to_air?.name).toBe('Felina');
    expect(show.cast?.[0]?.name).toBe('Bryan Cranston');
    expect(show).toEqual(expect.schemaMatching(tmdbGetShow.output));
    expect(getEnrichment(ctx).attribution).toContain('TMDB API');
  });

  it('throws show_not_found on a 404', async () => {
    await initServiceForTools();
    throwForPath('/tv/99999999', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({ errors: tmdbGetShow.errors });
    const input = tmdbGetShow.input.parse({ series_id: 99999999 });
    await expect(tmdbGetShow.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'show_not_found' },
    });
  });

  it('format() renders the show, seasons, and networks', () => {
    const blocks = tmdbGetShow.format!({
      id: 1396,
      name: 'Breaking Bad',
      genres: [{ id: 18, name: 'Drama' }],
      vote_average: 8.9,
      vote_count: 13000,
      popularity: 300,
      number_of_seasons: 5,
      number_of_episodes: 62,
      in_production: false,
      first_air_date: '2008-01-20',
      us_content_rating: 'TV-MA',
      networks: [{ id: 174, name: 'AMC', origin_country: 'US' }],
      seasons: [{ season_number: 1, name: 'Season 1', episode_count: 7 }],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Breaking Bad');
    expect(text).toContain('AMC');
    expect(text).toContain('Season 1');
    expect(text).toContain('TV-MA');
    expect(text).toContain('2008-01-20'); // first_air_date
  });
});
