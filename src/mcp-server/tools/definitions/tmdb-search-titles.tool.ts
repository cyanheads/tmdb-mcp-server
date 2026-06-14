/**
 * @fileoverview tmdb_search_titles — name → ranked results with integer ids across
 * movies, TV, and people. The required first step; TMDB keys on integer ids, not titles.
 * @module mcp-server/tools/definitions/tmdb-search-titles.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import {
  listEnrichment,
  renderSummaryItem,
  SummaryItemSchema,
  TMDB_ATTRIBUTION,
} from './_shared.js';

export const tmdbSearchTitles = tool('tmdb_search_titles', {
  title: 'tmdb-mcp-server: search titles',
  description:
    'Search movies, TV shows, and people by name on TMDB. The required first step — TMDB keys on integer ids, not titles, so use this to resolve a name to an id before any detail lookup. Returns ranked results with id, media_type, title/name, year, overview, vote average, resolved genre names, and full poster/profile image URLs. "multi" mode (default) mixes all three entity kinds; "movie"/"tv"/"person" restrict to one type.',
  annotations: { readOnlyHint: true, openWorldHint: true },
  input: z.object({
    query: z.string().min(1).describe('Search text — a movie, show, or person name. Required.'),
    mode: z
      .enum(['multi', 'movie', 'tv', 'person'])
      .default('multi')
      .describe(
        'What to search. "multi" (default) returns mixed movies, shows, and people ranked together — each result carries media_type. "movie"/"tv"/"person" restrict to one type and enable type-specific ranking.',
      ),
    year: z
      .number()
      .int()
      .min(1850)
      .max(2100)
      .optional()
      .describe(
        'Filter by release/first-air year. Applies to movie and tv modes; ignored for person and multi.',
      ),
    language: z
      .string()
      .optional()
      .describe(
        'Response language as ISO 639-1, optionally with region (e.g. "en-US", "fr"). Defaults to the server-configured language.',
      ),
    include_adult: z
      .boolean()
      .default(false)
      .describe('Include adult-content results. Default false.'),
    page: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(1)
      .describe('Result page (TMDB returns 20 per page). Use to fetch beyond the first 20.'),
  }),
  output: z.object({
    page: z.number().describe('Current page (1-indexed).'),
    total_pages: z.number().describe('Total pages available.'),
    total_results: z.number().describe('Total matching results across all pages.'),
    results: z.array(SummaryItemSchema).describe('Ranked results (up to 20 per page).'),
  }),
  enrichment: listEnrichment,

  async handler(input, ctx) {
    const result = await getTmdbService().search(
      {
        query: input.query,
        mode: input.mode,
        ...(input.year !== undefined ? { year: input.year } : {}),
        ...(input.language ? { language: input.language } : {}),
        include_adult: input.include_adult,
        page: input.page,
      },
      ctx,
    );

    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    ctx.enrich.total(result.total_results);
    if (result.results.length === 0) {
      ctx.enrich.notice(
        `No titles matched "${input.query}" in ${input.mode} mode. Try a different spelling, broaden the mode to "multi", or drop the year filter.`,
      );
    }

    return result;
  },

  format: (result) => {
    if (result.results.length === 0) {
      return [{ type: 'text', text: `No results (${result.total_results} total).` }];
    }
    const lines = [
      `**${result.total_results} results** (page ${result.page}/${result.total_pages})\n`,
    ];
    for (const r of result.results) lines.push(`- ${renderSummaryItem(r)}`);
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
