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
      },
    });
    const ctx = createMockContext({
      errors: tmdbMovieResource.errors,
      uri: new URL('tmdb://movie/550'),
    });
    const params = tmdbMovieResource.params.parse({ movie_id: '550' });
    const movie = await tmdbMovieResource.handler(params, ctx);
    expect(movie).toMatchObject({ id: 550, title: 'Fight Club' });
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
      },
    });
    const ctx = createMockContext({
      errors: tmdbTvResource.errors,
      uri: new URL('tmdb://tv/1396'),
    });
    const params = tmdbTvResource.params.parse({ series_id: '1396' });
    const show = await tmdbTvResource.handler(params, ctx);
    expect(show).toMatchObject({ id: 1396, name: 'Breaking Bad' });
  });

  it('tmdb://person/{id} resolves a person by id', async () => {
    await initServiceForTools({
      '/person/287': {
        id: 287,
        name: 'Brad Pitt',
        popularity: 1,
        combined_credits: { cast: [], crew: [] },
      },
    });
    const ctx = createMockContext({
      errors: tmdbPersonResource.errors,
      uri: new URL('tmdb://person/287'),
    });
    const params = tmdbPersonResource.params.parse({ person_id: '287' });
    const person = await tmdbPersonResource.handler(params, ctx);
    expect(person).toMatchObject({ id: 287, name: 'Brad Pitt' });
  });

  it('maps a 404 to the movie_not_found contract', async () => {
    await initServiceForTools();
    throwForPath('/movie/99999999', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({
      errors: tmdbMovieResource.errors,
      uri: new URL('tmdb://movie/99999999'),
    });
    const params = tmdbMovieResource.params.parse({ movie_id: '99999999' });
    await expect(tmdbMovieResource.handler(params, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'movie_not_found' },
    });
  });
});
