/**
 * @fileoverview Tests for tmdb_get_watch_providers — headline region-scoped availability,
 * the empty-but-valid region case, region caveat notice, title_not_found contract, and
 * format completeness.
 * @module tests/tools/tmdb-get-watch-providers.tool.test
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

const { tmdbGetWatchProviders } = await import(
  '@/mcp-server/tools/definitions/tmdb-get-watch-providers.tool.js'
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbGetWatchProviders', () => {
  it('shows the resolved title and alternatives when the queried region has no providers', async () => {
    vi.stubEnv('TMDB_LANGUAGE', 'fr-FR');
    const providers = {
      US: { link: 'https://www.themoviedb.org/movie/238/watch?locale=US' },
      GB: { link: 'https://www.themoviedb.org/movie/238/watch?locale=GB' },
    };
    await initServiceForTools({
      '/movie/238': {
        id: 238,
        title: 'Le Parrain',
        release_date: '1972-03-14',
        'watch/providers': { results: providers },
      },
      '/tv/238': { id: 238, name: 'Star Cops', 'watch/providers': { results: {} } },
    });
    const fetch = vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout');
    const movie = await runToolContract(tmdbGetWatchProviders, {
      media_type: 'movie',
      id: 238,
      watch_region: 'JP',
    });
    expect(movie.structuredContent).toMatchObject({
      title: 'Le Parrain',
      release_year: 1972,
      available_regions: ['GB', 'US'],
      region: 'JP',
      flatrate: [],
      rent: [],
      buy: [],
      ads: [],
      free: [],
      notice: expect.stringContaining('query a listed region separately'),
    });
    expect(movie.structuredContent).not.toHaveProperty('link');
    expect(JSON.stringify(movie.content)).toContain('Le Parrain (1972)');
    expect(JSON.stringify(movie.content)).toContain('GB, US');
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/3/movie/238');
    expect(url.searchParams.get('append_to_response')).toBe('watch/providers');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    fetch.mockRestore();

    const tv = await runToolContract(tmdbGetWatchProviders, {
      media_type: 'tv',
      id: 238,
      watch_region: 'JP',
    });
    expect(tv.structuredContent).toMatchObject({ title: 'Star Cops', available_regions: [] });
    expect(tv.structuredContent).not.toHaveProperty('release_year');
    expect(JSON.stringify(tv.content)).toContain('Star Cops');
    expect(JSON.stringify(tv.content)).not.toContain('query a listed region');
  });
  it('rejects an invalid region and preserves missing-title recovery on both surfaces', async () => {
    await initServiceForTools();
    const invalid = await runToolContract(tmdbGetWatchProviders, {
      media_type: 'movie',
      id: 238,
      watch_region: 'us',
    });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid.structuredContent)).toContain('-32602');

    throwForPath('/movie/99999999', JsonRpcErrorCode.NotFound);
    const missing = await runToolContract(tmdbGetWatchProviders, {
      media_type: 'movie',
      id: 99999999,
      watch_region: 'US',
    });
    expect(missing.isError).toBe(true);
    for (const surface of [missing.structuredContent, missing.content]) {
      expect(JSON.stringify(surface)).toContain('title_not_found');
      expect(JSON.stringify(surface)).toContain('tmdb_search_titles');
    }
  });
  it('returns region-scoped providers with the TMDB link (headline path)', async () => {
    await initServiceForTools({
      '/movie/550': {
        id: 550,
        title: 'Fight Club',
        'watch/providers': {
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
            },
          },
        },
      },
    });
    const ctx = createMockContext({ errors: tmdbGetWatchProviders.errors });
    const input = tmdbGetWatchProviders.input.parse({
      media_type: 'movie',
      id: 550,
      watch_region: 'US',
    });
    const result = await tmdbGetWatchProviders.handler(input, ctx);

    expect(result).toMatchObject({ id: 550, media_type: 'movie', region: 'US' });
    expect(result.link).toContain('themoviedb.org');
    expect(result.flatrate[0]?.provider_name).toBe('Netflix');
    expect(result.flatrate[0]?.logo_url).toBe('https://image.tmdb.org/t/p/w92/nf.jpg');
    expect(result).toEqual(expect.schemaMatching(tmdbGetWatchProviders.output));

    const enrichment = getEnrichment(ctx);
    expect(enrichment.attribution).toContain('TMDB API');
    expect(String(enrichment.notice)).toContain('US');
  });

  it('treats no providers for the region as a valid empty result, not an error', async () => {
    await initServiceForTools({
      '/tv/1396': { id: 1396, 'watch/providers': { results: {} } },
    });
    const ctx = createMockContext({ errors: tmdbGetWatchProviders.errors });
    const input = tmdbGetWatchProviders.input.parse({
      media_type: 'tv',
      id: 1396,
      watch_region: 'JP',
    });
    const result = await tmdbGetWatchProviders.handler(input, ctx);

    expect(result.flatrate).toEqual([]);
    expect(result.link).toBeUndefined();
    expect(String(getEnrichment(ctx).notice)).toContain('not be available');
  });

  it('throws title_not_found on a 404', async () => {
    await initServiceForTools();
    throwForPath('/movie/99999999', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({ errors: tmdbGetWatchProviders.errors });
    const input = tmdbGetWatchProviders.input.parse({
      media_type: 'movie',
      id: 99999999,
      watch_region: 'US',
    });
    await expect(tmdbGetWatchProviders.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'title_not_found' },
    });
  });

  it('format() renders provider sections', () => {
    const blocks = tmdbGetWatchProviders.format!({
      id: 550,
      media_type: 'movie',
      region: 'US',
      available_regions: ['US'],
      link: 'https://www.themoviedb.org/movie/550/watch?locale=US',
      flatrate: [{ provider_id: 8, provider_name: 'Netflix', display_priority: 1 }],
      rent: [],
      buy: [],
      ads: [],
      free: [],
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Netflix');
    expect(text).toContain('US');
    expect(text).toContain('themoviedb.org');
  });
});
