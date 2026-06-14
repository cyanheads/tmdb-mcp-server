/**
 * @fileoverview Tests for tmdb_get_movie — headline detail fetch with appends, US cert,
 * the movie_not_found error contract, sparse payload, and format completeness.
 * @module tests/tools/tmdb-get-movie.tool.test
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

const { tmdbGetMovie } = await import('@/mcp-server/tools/definitions/tmdb-get-movie.tool.js');

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

const FIGHT_CLUB = {
  id: 550,
  title: 'Fight Club',
  original_title: 'Fight Club',
  tagline: 'Mischief. Mayhem. Soap.',
  overview: 'A ticking-time-bomb insomniac...',
  status: 'Released',
  release_date: '1999-10-15',
  runtime: 139,
  genres: [{ id: 18, name: 'Drama' }],
  vote_average: 8.4,
  vote_count: 27000,
  popularity: 61.4,
  budget: 63000000,
  revenue: 100853753,
  imdb_id: 'tt0137523',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  credits: {
    cast: [
      { id: 287, name: 'Brad Pitt', character: 'Tyler Durden', order: 0, profile_path: '/b.jpg' },
    ],
    crew: [{ id: 7467, name: 'David Fincher', job: 'Director', department: 'Directing' }],
  },
  videos: {
    results: [{ id: 'v1', name: 'Trailer', key: 'abc123', site: 'YouTube', type: 'Trailer' }],
  },
  recommendations: {
    results: [{ id: 807, title: 'Se7en', vote_average: 8.3, genre_ids: [18, 53] }],
  },
  similar: { results: [{ id: 16869, title: 'Inglourious Basterds' }] },
  keywords: { keywords: [{ id: 825, name: 'support group' }] },
  external_ids: { imdb_id: 'tt0137523', wikidata_id: 'Q190050' },
  release_dates: {
    results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R', type: 3 }] }],
  },
};

describe('tmdbGetMovie', () => {
  it('fetches full detail with appends (headline path)', async () => {
    await initServiceForTools({ '/movie/550': FIGHT_CLUB });
    const ctx = createMockContext({ errors: tmdbGetMovie.errors });
    const input = tmdbGetMovie.input.parse({ movie_id: 550 });
    const movie = await tmdbGetMovie.handler(input, ctx);

    expect(movie).toMatchObject({
      id: 550,
      title: 'Fight Club',
      runtime_minutes: 139,
      us_certification: 'R',
      imdb_id: 'tt0137523',
    });
    expect(movie.cast?.[0]?.name).toBe('Brad Pitt');
    expect(movie.crew_key?.[0]?.job).toBe('Director');
    expect(movie.trailers?.[0]?.url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(movie.poster_url).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(movie.external_ids).toMatchObject({ wikidata_id: 'Q190050' });
    expect(movie).toEqual(expect.schemaMatching(tmdbGetMovie.output));
    expect(getEnrichment(ctx).attribution).toContain('TMDB API');
  });

  it('throws movie_not_found on a 404, carrying the contract recovery hint', async () => {
    await initServiceForTools();
    throwForPath('/movie/99999999', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({ errors: tmdbGetMovie.errors });
    const input = tmdbGetMovie.input.parse({ movie_id: 99999999 });
    await expect(tmdbGetMovie.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: {
        reason: 'movie_not_found',
        // Recovery reaches data.recovery.hint → surfaced on both client surfaces.
        recovery: { hint: tmdbGetMovie.errors![0]!.recovery },
      },
    });
  });

  it('handles a sparse payload (null poster, no appends requested)', async () => {
    await initServiceForTools({
      '/movie/13': {
        id: 13,
        title: 'Forrest Gump',
        genres: [],
        vote_average: 8.5,
        vote_count: 26000,
        popularity: 50,
        poster_path: null,
      },
    });
    const ctx = createMockContext({ errors: tmdbGetMovie.errors });
    const input = tmdbGetMovie.input.parse({ movie_id: 13, append: [] });
    const movie = await tmdbGetMovie.handler(input, ctx);
    expect(movie.poster_url).toBeUndefined();
    expect(movie.us_certification).toBeUndefined();
    expect(movie.cast).toBeUndefined();
    expect(movie).toEqual(expect.schemaMatching(tmdbGetMovie.output));
  });

  it('format() renders title, cast, crew, trailers, and recommendations', () => {
    const blocks = tmdbGetMovie.format!({
      id: 550,
      title: 'Fight Club',
      genres: [{ id: 18, name: 'Drama' }],
      vote_average: 8.4,
      vote_count: 27000,
      popularity: 61,
      release_date: '1999-10-15',
      us_certification: 'R',
      cast: [{ id: 287, name: 'Brad Pitt', character: 'Tyler', order: 0 }],
      crew_key: [{ id: 7467, name: 'David Fincher', job: 'Director' }],
      trailers: [
        { name: 'Trailer', key: 'abc', url: 'https://youtube.com/watch?v=abc', site: 'YouTube' },
      ],
      recommendations: [{ id: 807, media_type: 'movie', title: 'Se7en' }],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Fight Club');
    expect(text).toContain('Brad Pitt');
    expect(text).toContain('David Fincher');
    expect(text).toContain('youtube.com');
    expect(text).toContain('Se7en');
    expect(text).toContain('R'); // certification
  });
});
