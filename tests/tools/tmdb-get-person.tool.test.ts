/**
 * @fileoverview Tests for tmdb_get_person — headline filmography, recency ordering,
 * truncation disclosure when capped, person_not_found contract, and format completeness.
 * @module tests/tools/tmdb-get-person.tool.test
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

const { tmdbGetPerson } = await import('@/mcp-server/tools/definitions/tmdb-get-person.tool.js');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setRoutes(STARTUP_ROUTES);
});

describe('tmdbGetPerson', () => {
  it.each([
    [102, 51],
    [50, 0],
    [0, 50],
    [0, 0],
  ])(
    'walks independent cast/crew slices (%i/%i) on both surfaces',
    async (castTotal, crewTotal) => {
      const credits = (length: number) =>
        Array.from({ length }, (_, id) => ({
          id,
          media_type: id % 2 ? 'tv' : 'movie',
          title: `Credit ${id}`,
          name: `Credit ${id}`,
          ...(id === 0
            ? {}
            : id % 2
              ? { first_air_date: '2020-01-01' }
              : { release_date: '2020-12-31' }),
          job: 'Writer',
        }));
      await initServiceForTools({
        '/person/1': {
          id: 1,
          name: 'Person',
          biography: 'Biography',
          combined_credits: { cast: credits(castTotal), crew: credits(crewTotal) },
        },
      });
      const receivedCast: number[] = [];
      const receivedCrew: number[] = [];
      const pages = Math.max(1, Math.ceil(Math.max(castTotal, crewTotal) / 50));
      const fetch = vi.spyOn(await import('@cyanheads/mcp-ts-core/utils'), 'fetchWithTimeout');
      for (let credits_page = 1; credits_page <= pages + 1; credits_page++) {
        const result = await runToolContract(tmdbGetPerson, {
          person_id: 1,
          credits_page,
          language: 'de-DE',
        });
        expect(result.isError).not.toBe(true);
        const data = result.structuredContent as Record<string, unknown>;
        expect(data).toMatchObject({
          credits_page,
          cast_credits_total: castTotal,
          crew_credits_total: crewTotal,
          totalCount: castTotal + crewTotal,
          biography: 'Biography',
        });
        const cast = data.cast_credits as { id: number }[];
        const crew = data.crew_credits as { id: number }[];
        expect(cast).toHaveLength(Math.min(50, Math.max(0, castTotal - (credits_page - 1) * 50)));
        expect(crew).toHaveLength(Math.min(50, Math.max(0, crewTotal - (credits_page - 1) * 50)));
        receivedCast.push(...cast.map((c) => c.id));
        receivedCrew.push(...crew.map((c) => c.id));
        const text = result.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        expect(text).toContain(`Credits page: ${credits_page}`);
        expect(text).toContain('TMDB API');
        expect(text).toContain(`Cast credits** (${cast.length} of ${castTotal})`);
        expect(text).toContain(`Crew credits** (${crew.length} of ${crewTotal})`);
        for (const credit of [...cast, ...crew]) expect(text).toContain(`id ${credit.id}]`);
        if (credits_page < pages) {
          expect(data.next_credits_page).toBe(credits_page + 1);
          const call = `tmdb_get_person(${JSON.stringify({ person_id: 1, credits_page: credits_page + 1, language: 'de-DE' })})`;
          expect(String(data.notice)).toContain(call);
          expect(text).toContain(call);
          const serialized = String(data.notice).split('tmdb_get_person(')[1]?.split(').')[0];
          expect(serialized).toBeDefined();
          const nextInput = JSON.parse(String(serialized));
          const continued = await runToolContract(tmdbGetPerson, nextInput);
          expect(continued.isError).not.toBe(true);
          expect(continued.structuredContent).toMatchObject({ credits_page: credits_page + 1 });
        } else {
          expect(data.next_credits_page).toBeUndefined();
          expect(data.notice).toBeUndefined();
          expect(text).not.toContain('tmdb_get_person(');
        }
      }
      const expected = (total: number) =>
        total ? [...Array.from({ length: total - 1 }, (_, i) => i + 1), 0] : [];
      expect(receivedCast).toEqual(expected(castTotal));
      expect(receivedCrew).toEqual(expected(crewTotal));
      expect(fetch).toHaveBeenCalledTimes(pages + 1 + Math.max(0, pages - 1));
    },
  );

  it('rejects invalid pages and preserves the declared missing-person recovery', async () => {
    await initServiceForTools();
    for (const credits_page of [0, -1, 1.5]) {
      const result = await runToolContract(tmdbGetPerson, { person_id: 1, credits_page });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.structuredContent)).toContain('-32602');
    }
    throwForPath('/person/99999999', JsonRpcErrorCode.NotFound);
    const result = await runToolContract(tmdbGetPerson, { person_id: 99999999, credits_page: 2 });
    expect(result.isError).toBe(true);
    for (const surface of [result.structuredContent, result.content]) {
      expect(JSON.stringify(surface)).toContain('person_not_found');
      expect(JSON.stringify(surface)).toContain('tmdb_search_titles');
    }
  });
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
      credits_page: 1,
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
