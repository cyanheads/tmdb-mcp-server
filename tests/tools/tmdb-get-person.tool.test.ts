/**
 * @fileoverview Tests for tmdb_get_person — headline filmography, recency ordering,
 * truncation disclosure when capped, person_not_found contract, and format completeness.
 * @module tests/tools/tmdb-get-person.tool.test
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

const { tmdbGetPerson } = await import('@/mcp-server/tools/definitions/tmdb-get-person.tool.js');

afterEach(() => {
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbGetPerson', () => {
  it('returns a recency-ordered filmography with gender label (headline path)', async () => {
    await initServiceForTools({
      '/person/287': {
        id: 287,
        name: 'Brad Pitt',
        biography: 'William Bradley Pitt...',
        birthday: '1963-12-18',
        known_for_department: 'Acting',
        gender: 2,
        popularity: 40,
        imdb_id: 'nm0000093',
        profile_path: '/b.jpg',
        combined_credits: {
          cast: [
            {
              id: 1,
              media_type: 'movie',
              title: 'Older',
              release_date: '1994-01-01',
              vote_average: 7,
            },
            {
              id: 2,
              media_type: 'movie',
              title: 'Newer',
              release_date: '2019-01-01',
              vote_average: 8,
            },
          ],
          crew: [
            {
              id: 3,
              media_type: 'movie',
              title: 'Produced',
              job: 'Producer',
              release_date: '2013-01-01',
            },
          ],
        },
        external_ids: { wikidata_id: 'Q35332', instagram_id: 'brad' },
      },
    });

    const ctx = createMockContext({ errors: tmdbGetPerson.errors });
    const input = tmdbGetPerson.input.parse({ person_id: 287 });
    const person = await tmdbGetPerson.handler(input, ctx);

    expect(person).toMatchObject({
      id: 287,
      name: 'Brad Pitt',
      gender: 'male',
      imdb_id: 'nm0000093',
    });
    expect(person.cast_credits[0]?.title).toBe('Newer'); // recency desc
    expect(person.cast_credits[1]?.title).toBe('Older');
    expect(person.crew_credits[0]?.job).toBe('Producer');
    expect(person.cast_credits_total).toBe(2);
    expect(person.external_ids).toMatchObject({ wikidata_id: 'Q35332' });
    expect(person).toEqual(expect.schemaMatching(tmdbGetPerson.output));

    const enrichment = getEnrichment(ctx);
    expect(enrichment.attribution).toContain('TMDB API');
    expect(enrichment.totalCount).toBe(3); // 2 cast + 1 crew
    expect(enrichment.truncated).toBeUndefined(); // under the cap
  });

  it('discloses truncation when a credit list exceeds the display cap', async () => {
    const cast = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      media_type: 'movie' as const,
      title: `Film ${i}`,
      release_date: `20${String(10 + (i % 10)).padStart(2, '0')}-01-01`,
    }));
    await initServiceForTools({
      '/person/500': {
        id: 500,
        name: 'Prolific Actor',
        popularity: 5,
        combined_credits: { cast, crew: [] },
      },
    });

    const ctx = createMockContext({ errors: tmdbGetPerson.errors });
    const input = tmdbGetPerson.input.parse({ person_id: 500 });
    const person = await tmdbGetPerson.handler(input, ctx);

    expect(person.cast_credits).toHaveLength(50); // capped
    expect(person.cast_credits_total).toBe(60);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.truncated).toBe(true);
    expect(enrichment.cap).toBe(50);
    expect(String(enrichment.notice)).toContain('capped');
  });

  it('throws person_not_found on a 404', async () => {
    await initServiceForTools();
    throwForPath('/person/99999999', JsonRpcErrorCode.NotFound);
    const ctx = createMockContext({ errors: tmdbGetPerson.errors });
    const input = tmdbGetPerson.input.parse({ person_id: 99999999 });
    await expect(tmdbGetPerson.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'person_not_found' },
    });
  });

  it('format() renders cast and crew credits with totals', () => {
    const blocks = tmdbGetPerson.format!({
      id: 287,
      name: 'Brad Pitt',
      gender: 'male',
      popularity: 40,
      cast_credits: [{ id: 2, media_type: 'movie', title: 'Newer', release_year: 2019 }],
      crew_credits: [{ id: 3, media_type: 'movie', title: 'Produced', job: 'Producer' }],
      cast_credits_total: 1,
      crew_credits_total: 1,
    });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Brad Pitt');
    expect(text).toContain('Newer');
    expect(text).toContain('Producer');
  });
});
