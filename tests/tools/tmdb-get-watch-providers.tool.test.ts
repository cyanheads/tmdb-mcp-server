/**
 * @fileoverview Tests for tmdb_get_watch_providers — headline region-scoped availability,
 * the empty-but-valid region case, region caveat notice, title_not_found contract, and
 * format completeness.
 * @module tests/tools/tmdb-get-watch-providers.tool.test
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

const { tmdbGetWatchProviders } = await import(
  '@/mcp-server/tools/definitions/tmdb-get-watch-providers.tool.js'
);

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbGetWatchProviders', () => {
  it('returns region-scoped providers with the TMDB link (headline path)', async () => {
    await initServiceForTools({
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
      '/tv/1396/watch/providers': { id: 1396, results: {} },
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
    throwForPath('/movie/99999999/watch/providers', JsonRpcErrorCode.NotFound);
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
