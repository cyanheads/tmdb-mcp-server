/**
 * @fileoverview Tests for the tmdb://movie|tv|person resources — each resolves through
 * the paired detail service method and maps a 404 to its not-found contract.
 * @module tests/resources/tmdb-resources.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
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

const { tmdbMovieResource } = await import(
  '@/mcp-server/resources/definitions/tmdb-movie.resource.js'
);
const { tmdbTvResource } = await import('@/mcp-server/resources/definitions/tmdb-tv.resource.js');
const { tmdbPersonResource } = await import(
  '@/mcp-server/resources/definitions/tmdb-person.resource.js'
);

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdb resources', () => {
  it('tmdb://movie/{id} resolves a movie by id', async () => {
    await initServiceForTools({
      '/movie/550': {
        id: 550,
        title: 'Fight Club',
        genres: [],
        vote_average: 8.4,
        vote_count: 1,
        popularity: 1,
        belongs_to_collection: { id: 87359, name: 'Collection' },
        credits: {
          cast: Array.from({ length: 16 }, (_, index) => ({
            id: index + 1,
            name: `Cast ${index}`,
          })),
          crew: [{ id: 200, name: 'Editor', job: 'Editor' }],
        },
      },
    });
    const ctx = createMockContext({
      errors: tmdbMovieResource.errors,
      uri: new URL('tmdb://movie/550'),
    });
    const params = tmdbMovieResource.params!.parse({ movie_id: '550' });
    const movie = await tmdbMovieResource.handler(params, ctx);
    expect(movie).toMatchObject({ id: 550, title: 'Fight Club' });
    expect(movie).toMatchObject({
      cast_total: 16,
      crew_total: 1,
      cast: Array.from({ length: 15 }, (_, index) => ({ id: index + 1, name: `Cast ${index}` })),
      crew: [{ id: 200, name: 'Editor', job: 'Editor' }],
    });
    expect(movie).toHaveProperty('collection', { id: 87359, name: 'Collection' });
    expect(movie).not.toHaveProperty('credits_page');
    expect(movie).not.toHaveProperty('next_credits_page');
  });

  it('tmdb://tv/{id} resolves a show by id', async () => {
    await initServiceForTools({
      '/tv/1396': {
        id: 1396,
        name: 'Breaking Bad',
        genres: [],
        vote_average: 8.9,
        vote_count: 1,
        popularity: 1,
        number_of_seasons: 5,
        number_of_episodes: 62,
        seasons: [],
        aggregate_credits: {
          cast: [
            {
              id: 1,
              name: 'Series Lead',
              roles: [{ character: 'Lead', episode_count: 62 }],
              total_episode_count: 62,
            },
          ],
          crew: [],
        },
      },
    });
    const ctx = createMockContext({
      errors: tmdbTvResource.errors,
      uri: new URL('tmdb://tv/1396'),
    });
    const params = tmdbTvResource.params!.parse({ series_id: '1396' });
    const show = await tmdbTvResource.handler(params, ctx);
    expect(show).toMatchObject({ id: 1396, name: 'Breaking Bad' });
    expect(show).toMatchObject({
      cast_total: 1,
      crew_total: 0,
      cast: [
        {
          id: 1,
          name: 'Series Lead',
          character: 'Lead',
          total_episode_count: 62,
          roles: [{ character: 'Lead', episode_count: 62 }],
        },
      ],
      crew: [],
    });
    expect(show).not.toHaveProperty('credits_page');
    expect(show).not.toHaveProperty('next_credits_page');
  });

  it('tmdb://person/{id} resolves a person by id', async () => {
    await initServiceForTools({
      '/person/287': {
        id: 287,
        name: 'Brad Pitt',
        popularity: 1,
        combined_credits: {
          cast: [
            ...Array.from({ length: 50 }, (_, id) => ({
              id,
              title: `Credit ${id}`,
              release_date: '2020-01-01',
            })),
            {
              id: 99,
              media_type: 'tv',
              name: 'A long-running series',
              first_air_date: '1968-01-01',
              first_credit_air_date: '2021-01-01',
              episode_count: 1,
            },
          ],
          crew: [],
        },
      },
    });
    const ctx = createMockContext({
      errors: tmdbPersonResource.errors,
      uri: new URL('tmdb://person/287'),
    });
    const params = tmdbPersonResource.params!.parse({ person_id: '287' });
    const person = await tmdbPersonResource.handler(params, ctx);
    expect(person).toMatchObject({ id: 287, name: 'Brad Pitt' });
    expect(person).toMatchObject({
      cast_credits: [
        expect.objectContaining({ id: 99, release_year: 2021, episode_count: 1 }),
        ...Array.from({ length: 49 }, (_, id) => expect.objectContaining({ id })),
      ],
      cast_credits_total: 51,
    });
    expect(person).not.toHaveProperty('credits_page');
    expect(person).not.toHaveProperty('next_credits_page');
  });

  it('maps a 404 to the movie_not_found contract', async () => {
    await initServiceForTools();
    throwForPath('/movie/99999999', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({
      errors: tmdbMovieResource.errors,
      uri: new URL('tmdb://movie/99999999'),
    });
    const params = tmdbMovieResource.params!.parse({ movie_id: '99999999' });
    await expect(tmdbMovieResource.handler(params, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'movie_not_found' },
    });
  });
});
