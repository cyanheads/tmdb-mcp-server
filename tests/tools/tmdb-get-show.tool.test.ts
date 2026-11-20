/**
 * @fileoverview Tests for tmdb_get_show — headline detail with seasons/networks/content
 * rating, show_not_found contract, and format completeness.
 * @module tests/tools/tmdb-get-show.tool.test
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
  aggregate_credits: {
    cast: [
      {
        id: 17419,
        name: 'Bryan Cranston',
        roles: [{ character: 'Walter White', episode_count: 62 }],
        total_episode_count: 62,
        order: 0,
      },
    ],
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
    expect(show.cast?.[0]).toMatchObject({ id: 17419, character: 'Walter White', order: 0 });
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

describe('show aggregate credits contract', () => {
  const roles = [
    { credit_id: 'cast-1', character: 'Lord Stark', episode_count: 9 },
    { credit_id: 'cast-2', character: 'Narrator', episode_count: 0 },
  ];
  const jobs = [
    { credit_id: 'crew-1', job: 'Director', episode_count: 3 },
    { credit_id: 'crew-2', job: 'Writer', episode_count: 1 },
  ];

  it('preserves grouped roles and jobs for series-wide credits on both surfaces', async () => {
    await initServiceForTools({
      '/tv/1399?language=de-DE&append_to_response=aggregate_credits%2Ccontent_ratings': {
        ...BREAKING_BAD,
        id: 1399,
        name: 'Game of Thrones',
        aggregate_credits: {
          cast: [
            ...Array.from({ length: 15 }, (_, index) => ({
              id: 1 + index,
              name: `Cast ${index}`,
              roles: [],
              total_episode_count: 0,
            })),
            { id: 48, name: 'Sean Bean', roles, total_episode_count: 9, order: 15 },
          ],
          crew: [
            {
              id: 49,
              name: 'Director and Writer',
              jobs,
              department: 'Directing',
              total_episode_count: 4,
            },
          ],
        },
      },
    });
    const input = {
      series_id: 1399,
      append: ['credits', 'content_ratings'] as ('credits' | 'content_ratings')[],
      language: 'de-DE',
    };
    const first = await runToolContract(tmdbGetShow, input);
    expect(first.structuredContent).toMatchObject({
      cast_total: 16,
      crew_total: 1,
      credits_page: 1,
      next_credits_page: 2,
      crew: [
        {
          id: 49,
          name: 'Director and Writer',
          job: 'Director',
          department: 'Directing',
          total_episode_count: 4,
          jobs: [
            { job: 'Director', episode_count: 3 },
            { job: 'Writer', episode_count: 1 },
          ],
        },
      ],
    });
    expect(first.structuredContent).toHaveProperty(
      'cast',
      expect.arrayContaining([{ id: 1, name: 'Cast 0', roles: [], total_episode_count: 0 }]),
    );
    const nextCall =
      'tmdb_get_show({"series_id":1399,"append":["credits","content_ratings"],"language":"de-DE","credits_page":2})';
    expect(first.structuredContent).toHaveProperty('notice', nextCall);
    expect(first.content).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining(`\`${nextCall}\``) }),
    );
    expect(JSON.stringify(first.content)).toMatch(
      /Director \(3 episodes\)[\s\S]*Writer \(1 episode\)[\s\S]*4 episodes total/,
    );

    const second = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetShow, {
      ...input,
      credits_page: 2,
    });
    expect(second.structuredContent).toMatchObject({
      cast_total: 16,
      crew_total: 1,
      credits_page: 2,
      crew: [],
      cast: [
        {
          id: 48,
          name: 'Sean Bean',
          character: 'Lord Stark',
          total_episode_count: 9,
          order: 15,
          roles: [
            { character: 'Lord Stark', episode_count: 9 },
            { character: 'Narrator', episode_count: 0 },
          ],
        },
      ],
    });
    expect(second.structuredContent).not.toHaveProperty('next_credits_page');
    expect(JSON.stringify(second.content)).toMatch(
      /Sean Bean[\s\S]*Lord Stark \(9 episodes\)[\s\S]*Narrator \(0 episodes\)[\s\S]*9 episodes total/,
    );
  });

  it('retains totals on empty and exact-boundary credit pages', async () => {
    const cast = Array.from({ length: 15 }, (_, index) => ({
      id: index + 1,
      name: `Cast ${index}`,
    }));
    await initServiceForTools({
      '/tv/1396': { ...BREAKING_BAD, aggregate_credits: { cast, crew: [] } },
      '/tv/1397': { ...BREAKING_BAD, id: 1397, aggregate_credits: { cast: [], crew: [] } },
    });
    const exact = await runToolContract(tmdbGetShow, { series_id: 1396, append: ['credits'] });
    expect(exact.structuredContent).toHaveProperty('cast', cast);
    expect(exact.structuredContent).toMatchObject({
      credits_page: 1,
      cast_total: 15,
      crew_total: 0,
      crew: [],
    });
    expect(exact.structuredContent).not.toHaveProperty('next_credits_page');
    expect(JSON.stringify(exact.content)).toContain('Cast total: 15');

    const empty = await runToolContract(tmdbGetShow, { series_id: 1397, append: ['credits'] });
    expect(empty.structuredContent).toMatchObject({
      credits_page: 1,
      cast_total: 0,
      crew_total: 0,
      cast: [],
      crew: [],
    });
    expect(empty.structuredContent).not.toHaveProperty('next_credits_page');
    expect(JSON.stringify(empty.content)).toContain('Crew total: 0');
  });

  it.each([0, -1, 1.5])('rejects invalid credits_page %s', async (credits_page) => {
    const result = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetShow, {
      series_id: 1396,
      credits_page,
    });
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.InvalidParams },
    });
    expect(JSON.stringify(result.content)).toContain('credits_page');
  });

  it('omits credit fields when no credit append is requested', async () => {
    await initServiceForTools({
      '/tv/1396?language=en-US&append_to_response=videos': BREAKING_BAD,
    });
    const result = await runToolContract(tmdbGetShow, { series_id: 1396, append: ['videos'] });
    expect(result.isError).not.toBe(true);
    for (const key of [
      'credits_page',
      'next_credits_page',
      'cast',
      'cast_total',
      'crew',
      'crew_total',
      'crew_key',
    ]) {
      expect(result.structuredContent).not.toHaveProperty(key);
    }
    expect(JSON.stringify(result.content)).not.toContain('Credits page:');
  });
});
