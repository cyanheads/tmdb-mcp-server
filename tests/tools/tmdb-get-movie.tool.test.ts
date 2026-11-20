/**
 * @fileoverview Tests for tmdb_get_movie — headline detail fetch with appends, US cert,
 * the movie_not_found error contract, sparse payload, and format completeness.
 * @module tests/tools/tmdb-get-movie.tool.test
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
    expect(movie.cast?.[0]).toMatchObject({ id: 287, character: 'Tyler Durden', order: 0 });
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
        recovery: { hint: expect.stringContaining('Verify the id with tmdb_search_titles') },
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

describe('movie credits and collection contract', () => {
  const membership = { id: 87359, name: 'Mission: Impossible Collection', poster_path: '/mi.jpg' };

  it('includes collection metadata by default and orders explicitly requested parts', async () => {
    await initServiceForTools({
      '/movie/954': {
        ...FIGHT_CLUB,
        id: 954,
        title: 'Mission: Impossible',
        belongs_to_collection: membership,
      },
      '/collection/87359?language=fr-FR': {
        id: 87359,
        parts: [
          { id: 575265, title: 'The Final Reckoning', release_date: '2025-05-23' },
          { id: 12, title: 'Undated' },
          { id: 575264, title: 'Dead Reckoning', release_date: '2023-07-12' },
          { id: 13, title: 'Same Date', release_date: '2023-07-12' },
        ],
      },
    });
    const defaultResult = await runToolContract(tmdbGetMovie, { movie_id: 954 });
    expect(defaultResult.structuredContent).toHaveProperty('collection', {
      id: 87359,
      name: 'Mission: Impossible Collection',
      poster_url: 'https://image.tmdb.org/t/p/w500/mi.jpg',
    });
    expect(defaultResult.content[0]).toHaveProperty('text', expect.stringContaining('87359'));

    const result = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetMovie, {
      movie_id: 954,
      language: 'fr-FR',
      append: ['collection'],
    });
    expect(result.structuredContent).toHaveProperty('collection.parts', [
      { id: 575264, title: 'Dead Reckoning', media_type: 'movie', release_year: 2023 },
      { id: 13, title: 'Same Date', media_type: 'movie', release_year: 2023 },
      { id: 575265, title: 'The Final Reckoning', media_type: 'movie', release_year: 2025 },
      { id: 12, title: 'Undated', media_type: 'movie' },
    ]);
    expect(result.content[0]).toHaveProperty(
      'text',
      expect.stringMatching(
        /87359[\s\S]*Dead Reckoning[\s\S]*Same Date[\s\S]*The Final Reckoning[\s\S]*Undated/,
      ),
    );
    expect(result.structuredContent).not.toHaveProperty('credits_page');
  });

  it.each([undefined, null])(
    'omits absent collection membership (%s) and skips the request',
    async (belongs_to_collection) => {
      await initServiceForTools({ '/movie/550': { ...FIGHT_CLUB, belongs_to_collection } });
      const result = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetMovie, {
        movie_id: 550,
        append: ['collection'],
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).not.toHaveProperty('collection');
      expect(result.content[0]).not.toHaveProperty('text', expect.stringContaining('Collection:'));
    },
  );

  it('distinguishes an empty collection and a collection lookup failure', async () => {
    await initServiceForTools({
      '/movie/550': { ...FIGHT_CLUB, belongs_to_collection: membership },
      '/collection/87359': { id: 87359, parts: [] },
    });
    const call = () =>
      runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetMovie, {
        movie_id: 550,
        append: ['collection'],
      });
    const empty = await call();
    expect(empty.structuredContent).toHaveProperty('collection.parts', []);
    expect(empty.content[0]).toHaveProperty('text', expect.stringContaining('No collection parts'));

    throwForPath('/collection/87359', JsonRpcErrorCode.NotFound);
    const failed = await call();
    expect(failed.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.NotFound,
        data: {
          reason: 'collection_not_found',
          recovery: { hint: expect.stringContaining('without "collection"') },
        },
      },
    });
    expect(JSON.stringify(failed.content)).toContain('collection_not_found');
  });

  it('pages independent cast and crew lists and preserves repeated TMDB rows', async () => {
    const credits = {
      cast: Array.from({ length: 16 }, (_, index) => ({ id: 20 + index, name: `Cast ${index}` })),
      crew: [
        ...Array.from({ length: 49 }, (_, index) => ({
          id: 40 + index,
          name: `Crew ${index}`,
          job: 'Director',
        })),
        { id: 100, name: 'Repeat Crew', job: 'Director' },
        { id: 100, name: 'Repeat Crew', job: 'Editor' },
      ],
    };
    await initServiceForTools({ '/movie/550': { ...FIGHT_CLUB, credits } });
    const input = {
      movie_id: 550,
      append: ['credits', 'videos'] as ('credits' | 'videos')[],
      language: 'ja-JP',
    };
    const first = await runToolContract(tmdbGetMovie, input);
    expect(first.structuredContent).toMatchObject({
      credits_page: 1,
      next_credits_page: 2,
      cast_total: 16,
      crew_total: 51,
    });
    expect(first.structuredContent).toHaveProperty('cast', credits.cast.slice(0, 15));
    expect(first.structuredContent).toHaveProperty('crew', credits.crew.slice(0, 50));
    const nextCall =
      'tmdb_get_movie({"movie_id":550,"append":["credits","videos"],"language":"ja-JP","credits_page":2})';
    expect(first.structuredContent).toHaveProperty('notice', nextCall);
    expect(first.content).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining(`\`${nextCall}\``) }),
    );
    expect(JSON.stringify(first.content)).toContain('Next credits page: 2');

    const second = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetMovie, {
      ...input,
      credits_page: 2,
    });
    expect(second.structuredContent).toMatchObject({
      credits_page: 2,
      cast_total: 16,
      crew_total: 51,
      cast: [{ id: 35, name: 'Cast 15' }],
      crew: [{ id: 100, name: 'Repeat Crew', job: 'Editor' }],
    });
    expect(second.structuredContent).not.toHaveProperty('next_credits_page');
    expect(JSON.stringify(second.content)).toMatch(/Cast 15[\s\S]*Repeat Crew — Editor/);

    const pastEnd = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbGetMovie, {
      ...input,
      credits_page: 3,
    });
    expect(pastEnd.structuredContent).toMatchObject({
      credits_page: 3,
      cast_total: 16,
      crew_total: 51,
      cast: [],
      crew: [],
    });
    expect(pastEnd.structuredContent).not.toHaveProperty('next_credits_page');
    expect(JSON.stringify(pastEnd.content)).toContain('Credits page: 3');
    expect(JSON.stringify(pastEnd.content)).toContain('**Cast:**\\nNone on this page.');
    expect(JSON.stringify(pastEnd.content)).toContain('**Crew:**\\nNone on this page.');
  });
});
