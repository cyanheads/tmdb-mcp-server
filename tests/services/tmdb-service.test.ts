/**
 * @fileoverview Tests for TmdbService — startup cache, image/genre resolution,
 * normalization, discover dot-notation translation, and the HTML/non-OK error paths.
 * @module tests/services/tmdb-service.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIGURATION_FIXTURE,
  mockFetchWithTimeout,
  STARTUP_ROUTES,
  setRoutes,
  throwForPath,
  withStartupRoutes,
} from '../helpers/mock-tmdb.js';

vi.mock('@cyanheads/mcp-ts-core/utils', async (importActual) => {
  const actual = await importActual<typeof import('@cyanheads/mcp-ts-core/utils')>();
  return { ...actual, fetchWithTimeout: mockFetchWithTimeout };
});

// Imported after the mock so the service's `fetchWithTimeout` binding is the mock.
const { TmdbService } = await import('@/services/tmdb/tmdb-service.js');

const ctx = createMockContext();

async function initService(extraRoutes = {}) {
  setRoutes(withStartupRoutes(extraRoutes));
  const svc = new TmdbService('test-bearer-token');
  await svc.init(ctx);
  return svc;
}

describe('TmdbService.init (startup cache)', () => {
  beforeEach(() => setRoutes(STARTUP_ROUTES));

  it('fetches /configuration and both genre lists', async () => {
    await expect(initService()).resolves.toBeDefined();
  });

  it('throws ConfigurationError when /configuration has no image base', async () => {
    setRoutes({ ...STARTUP_ROUTES, '/configuration': { images: {} } });
    const svc = new TmdbService('test-bearer-token');
    await expect(svc.init(ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.ConfigurationError,
    });
  });

  it('aborts startup loudly when a genre list is unreachable', async () => {
    setRoutes({ '/configuration': CONFIGURATION_FIXTURE });
    throwForPath('/genre/movie/list', JsonRpcErrorCode.ServiceUnavailable);
    const svc = new TmdbService('test-bearer-token');
    await expect(svc.init(ctx)).rejects.toThrow();
  });
});

describe('TmdbService.search (headline: name → ids + image/genre resolution)', () => {
  it('resolves genre ids to names and poster paths to full URLs', async () => {
    const svc = await initService({
      '/search/movie': {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 550,
            title: 'Fight Club',
            release_date: '1999-10-15',
            vote_average: 8.4,
            genre_ids: [18, 53],
            poster_path: '/poster.jpg',
          },
        ],
      },
    });

    const result = await svc.search(
      { query: 'fight club', mode: 'movie', include_adult: false, page: 1 },
      ctx,
    );

    expect(result.total_results).toBe(1);
    const item = result.results[0]!;
    expect(item.id).toBe(550);
    expect(item.media_type).toBe('movie'); // typed-search fallback
    expect(item.release_year).toBe(1999);
    expect(item.genre_names).toEqual(['Drama', 'Thriller']);
    expect(item.poster_url).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
  });

  it('omits poster_url when the upstream poster_path is null (sparse payload)', async () => {
    const svc = await initService({
      '/search/multi': {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 1, media_type: 'movie', title: 'No Poster', poster_path: null }],
      },
    });
    const result = await svc.search(
      { query: 'x', mode: 'multi', include_adult: false, page: 1 },
      ctx,
    );
    expect(result.results[0]!.poster_url).toBeUndefined();
    expect(result.results[0]!.genre_names).toBeUndefined();
  });

  it('carries known_for media items (poster_path, not profile_path) for people', async () => {
    const svc = await initService({
      '/search/person': {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 287,
            name: 'Brad Pitt',
            profile_path: '/brad.jpg',
            known_for_department: 'Acting',
            known_for: [
              { id: 550, media_type: 'movie', title: 'Fight Club', poster_path: '/fc.jpg' },
            ],
          },
        ],
      },
    });
    const result = await svc.search(
      { query: 'brad pitt', mode: 'person', include_adult: false, page: 1 },
      ctx,
    );
    const p = result.results[0]!;
    expect(p.media_type).toBe('person');
    expect(p.profile_url).toBe('https://image.tmdb.org/t/p/w185/brad.jpg');
    expect(p.known_for?.[0]).toMatchObject({
      id: 550,
      media_type: 'movie',
      title: 'Fight Club',
      poster_url: 'https://image.tmdb.org/t/p/w500/fc.jpg',
    });
  });
});

describe('TmdbService.getMovie (append normalization + US cert)', () => {
  it('extracts the type-3 theatrical US certification and key crew', async () => {
    const svc = await initService({
      '/movie/550': {
        id: 550,
        title: 'Fight Club',
        runtime: 139,
        genres: [{ id: 18, name: 'Drama' }],
        vote_average: 8.4,
        vote_count: 27000,
        popularity: 60,
        budget: 63000000,
        revenue: 100853753,
        poster_path: '/p.jpg',
        credits: {
          cast: [
            { id: 287, name: 'Brad Pitt', character: 'Tyler', order: 0, profile_path: '/b.jpg' },
          ],
          crew: [
            { id: 7467, name: 'David Fincher', job: 'Director', department: 'Directing' },
            { id: 1, name: 'Some Gaffer', job: 'Gaffer', department: 'Lighting' },
          ],
        },
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                { certification: '', type: 1 },
                { certification: 'R', type: 3 },
              ],
            },
          ],
        },
      },
    });

    const movie = await svc.getMovie(550, ['credits', 'release_dates'], ctx);
    expect(movie.title).toBe('Fight Club');
    expect(movie.runtime_minutes).toBe(139);
    expect(movie.us_certification).toBe('R');
    expect(movie.cast).toHaveLength(1);
    expect(movie.crew_key).toHaveLength(1); // only the Director, Gaffer filtered out
    expect(movie.crew_key?.[0]?.job).toBe('Director');
  });

  it('maps a 404 to a movie_not_found NotFound error with a contract recovery hint', async () => {
    const svc = await initService();
    throwForPath('/movie/99999999', JsonRpcErrorCode.NotFound);
    await expect(svc.getMovie(99999999, [], ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: {
        reason: 'movie_not_found',
        recovery: { hint: expect.stringContaining('tmdb_search_titles (mode "movie")') },
      },
    });
  });
});

describe('TmdbService not-found recovery hints (one per detail kind)', () => {
  /**
   * Every detail/resource error contract declares a `recovery` string; the service
   * must attach it as `data.recovery.hint` so it reaches both client surfaces (the
   * framework only surfaces a recovery hint already present in the thrown error).
   */
  it('attaches a show recovery hint on a 404', async () => {
    const svc = await initService();
    throwForPath('/tv/99999999', JsonRpcErrorCode.NotFound);
    await expect(svc.getShow(99999999, [], ctx)).rejects.toMatchObject({
      data: {
        reason: 'show_not_found',
        recovery: { hint: expect.stringContaining('tmdb_search_titles (mode "tv")') },
      },
    });
  });

  it('attaches a season recovery hint on a 404', async () => {
    const svc = await initService();
    throwForPath('/tv/1396/season/99', JsonRpcErrorCode.NotFound);
    await expect(svc.getSeason(1396, 99, ctx)).rejects.toMatchObject({
      data: {
        reason: 'season_not_found',
        recovery: { hint: expect.stringContaining('tmdb_get_show') },
      },
    });
  });

  it('attaches a person recovery hint on a 404', async () => {
    const svc = await initService();
    throwForPath('/person/99999999', JsonRpcErrorCode.NotFound);
    await expect(svc.getPerson(99999999, ctx)).rejects.toMatchObject({
      data: {
        reason: 'person_not_found',
        recovery: { hint: expect.stringContaining('tmdb_search_titles (mode "person")') },
      },
    });
  });

  it('attaches a title recovery hint on a watch-providers 404', async () => {
    const svc = await initService();
    throwForPath('/movie/99999999/watch/providers', JsonRpcErrorCode.NotFound);
    await expect(svc.getWatchProviders('movie', 99999999, 'US', ctx)).rejects.toMatchObject({
      data: {
        reason: 'title_not_found',
        recovery: { hint: expect.stringContaining('media_type matches it') },
      },
    });
  });
});

describe('TmdbService.getSeason (series_id echo + guest stars)', () => {
  it('echoes series_id from input and surfaces per-episode guest stars + regular cast', async () => {
    const svc = await initService({
      '/tv/1396/season/1': {
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
            runtime: 58,
            vote_average: 8.9,
            still_path: '/still.jpg',
            guest_stars: [{ id: 92495, name: 'John Koyama', character: 'Emilio', order: 0 }],
          },
        ],
        credits: {
          cast: [{ id: 17419, name: 'Bryan Cranston', character: 'Walter White', order: 0 }],
        },
      },
    });

    const season = await svc.getSeason(1396, 1, ctx);
    expect(season.series_id).toBe(1396); // NOT in the API response — echoed
    expect(season.season_number).toBe(1);
    expect(season.episodes[0]?.guest_stars?.[0]?.name).toBe('John Koyama');
    expect(season.regular_cast?.[0]?.name).toBe('Bryan Cranston');
    expect(season.episodes[0]?.still_url).toBe('https://image.tmdb.org/t/p/w300/still.jpg');
  });
});

describe('TmdbService.getPerson (recency-ordered, capped credits, gender label)', () => {
  it('sorts credits by release year desc and maps gender to a label', async () => {
    const svc = await initService({
      '/person/287': {
        id: 287,
        name: 'Brad Pitt',
        gender: 2,
        imdb_id: 'nm0000093',
        profile_path: '/b.jpg',
        combined_credits: {
          cast: [
            { id: 1, media_type: 'movie', title: 'Old', release_date: '1995-01-01' },
            { id: 2, media_type: 'movie', title: 'New', release_date: '2020-01-01' },
          ],
          crew: [],
        },
        external_ids: { wikidata_id: 'Q35332', twitter_id: 'brad' },
      },
    });

    const person = await svc.getPerson(287, ctx);
    expect(person.gender).toBe('male');
    expect(person.imdb_id).toBe('nm0000093');
    expect(person.cast_credits[0]?.title).toBe('New'); // 2020 before 1995
    expect(person.cast_credits[1]?.title).toBe('Old');
    expect(person.cast_credits_total).toBe(2);
    expect(person.external_ids).toMatchObject({ wikidata_id: 'Q35332', twitter_id: 'brad' });
  });
});

describe('TmdbService.discover (dot-notation translation)', () => {
  it('builds dot-notation range params and joins arrays correctly', async () => {
    // Capture the exact URL the service constructs to verify the snake→dot translation.
    const urls: string[] = [];
    setRoutes(
      withStartupRoutes({
        '/discover/movie': {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ id: 1, title: 'X' }],
        },
      }),
    );
    vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout').mockImplementation(
      (async (url: string | URL) => {
        urls.push(typeof url === 'string' ? url : url.toString());
        return mockFetchWithTimeout(url);
      }) as never,
    );

    const svc = new TmdbService('t');
    await svc.init(ctx);
    await svc.discover(
      {
        media_type: 'movie',
        sort_by: 'vote_average.desc',
        with_genres: [28, 18],
        vote_count_gte: 100,
        vote_average_gte: 7,
        release_date_gte: '2000-01-01',
        runtime_gte: 90,
        with_cast: [287, 819],
        include_adult: false,
        page: 1,
      },
      ctx,
    );

    const url = urls.find((u) => u.includes('/discover/movie')) ?? '';
    // Dot notation — snake_case variants would silently return ALL results.
    expect(url).toContain('vote_count.gte=100');
    expect(url).toContain('vote_average.gte=7');
    expect(url).toContain('primary_release_date.gte=2000-01-01');
    expect(url).toContain('with_runtime.gte=90');
    expect(url).toContain('with_genres=28%2C18'); // comma-joined (AND), URL-encoded
    expect(url).toContain('with_cast=287%7C819'); // pipe-joined (OR), URL-encoded
    vi.restoreAllMocks();
  });

  it('uses first_air_date.gte for tv and with_networks (pipe-joined)', async () => {
    const urls: string[] = [];
    setRoutes(
      withStartupRoutes({
        '/discover/tv': { page: 1, total_pages: 1, total_results: 0, results: [] },
      }),
    );
    vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout').mockImplementation(
      (async (url: string | URL) => {
        urls.push(typeof url === 'string' ? url : url.toString());
        return mockFetchWithTimeout(url);
      }) as never,
    );

    const svc = new TmdbService('t');
    await svc.init(ctx);
    await svc.discover(
      {
        media_type: 'tv',
        sort_by: 'popularity.desc',
        release_date_gte: '2010-01-01',
        with_networks: [213, 1024],
        include_adult: false,
        page: 1,
      },
      ctx,
    );

    const url = urls.find((u) => u.includes('/discover/tv')) ?? '';
    expect(url).toContain('first_air_date.gte=2010-01-01');
    expect(url).toContain('with_networks=213%7C1024');
    vi.restoreAllMocks();
  });
});

describe('TmdbService.getWatchProviders (region mapping)', () => {
  it('maps the region sub-object to flat provider arrays + link', async () => {
    const svc = await initService({
      '/movie/550/watch/providers': {
        id: 550,
        results: {
          US: {
            link: 'https://www.themoviedb.org/movie/550/watch?locale=US',
            flatrate: [
              {
                provider_id: 8,
                provider_name: 'Netflix',
                logo_path: '/nf.jpg',
                display_priority: 1,
              },
            ],
            rent: [
              {
                provider_id: 2,
                provider_name: 'Apple TV',
                logo_path: '/atv.jpg',
                display_priority: 3,
              },
            ],
          },
        },
      },
    });

    const wp = await svc.getWatchProviders('movie', 550, 'US', ctx);
    expect(wp.link).toContain('themoviedb.org');
    expect(wp.flatrate[0]?.provider_name).toBe('Netflix');
    expect(wp.flatrate[0]?.logo_url).toBe('https://image.tmdb.org/t/p/w92/nf.jpg');
    expect(wp.rent[0]?.provider_name).toBe('Apple TV');
    expect(wp.buy).toEqual([]);
  });

  it('returns empty arrays and no link when the region has no data', async () => {
    const svc = await initService({
      '/tv/1396/watch/providers': { id: 1396, results: {} },
    });
    const wp = await svc.getWatchProviders('tv', 1396, 'JP', ctx);
    expect(wp.link).toBeUndefined();
    expect(wp.flatrate).toEqual([]);
    expect(wp.free).toEqual([]);
  });
});

describe('TmdbService HTML-error guard', () => {
  it('treats an HTML body as a transient error rather than parsing it', async () => {
    setRoutes(STARTUP_ROUTES);
    const svc = new TmdbService('t');
    await svc.init(ctx);
    // Route an HTML body for a movie request.
    vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout').mockImplementation(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          async text() {
            return '<!DOCTYPE html><html><body>error</body></html>';
          },
        }) as Response) as never,
    );
    await expect(svc.getMovie(550, [], ctx)).rejects.toThrow();
    vi.restoreAllMocks();
  });
});
