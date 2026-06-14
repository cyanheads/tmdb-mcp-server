/**
 * @fileoverview tmdb_get_trending — trending movies, TV, or people for the day or week.
 * @module mcp-server/tools/definitions/tmdb-get-trending.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import {
  listEnrichment,
  renderSummaryItem,
  SummaryItemSchema,
  TMDB_ATTRIBUTION,
} from './_shared.js';

export const tmdbGetTrending = tool('tmdb_get_trending', {
  title: 'tmdb-mcp-server: get trending',
  description:
    'Fetch the trending movies, TV shows, or people for the day or week on TMDB. Returns ranked summary cards with id, media_type, title/name, year, overview, rating, resolved genre names, and image URLs. "all" mixes all three entity kinds (each result carries media_type); "day" is more volatile than "week".',
  annotations: { readOnlyHint: true, openWorldHint: true },
  input: z.object({
    media_type: z
      .enum(['all', 'movie', 'tv', 'person'])
      .default('all')
      .describe(
        'Which trending list. "all" mixes movies, shows, and people (each result carries media_type).',
      ),
    time_window: z
      .enum(['day', 'week'])
      .default('week')
      .describe('Trending window. "day" is more volatile; "week" is steadier.'),
    language: z.string().optional().describe('Response language (ISO 639-1[-COUNTRY]).'),
    page: z.number().int().min(1).max(500).default(1).describe('Result page (20 per page).'),
  }),
  output: z.object({
    page: z.number().describe('Current page (1-indexed).'),
    total_pages: z.number().describe('Total pages available.'),
    total_results: z.number().describe('Total trending results across all pages.'),
    results: z
      .array(SummaryItemSchema)
      .describe('Ranked trending summary cards (up to 20 per page).'),
  }),
  enrichment: listEnrichment,

  async handler(input, ctx) {
    const result = await getTmdbService().getTrending(
      {
        media_type: input.media_type,
        time_window: input.time_window,
        ...(input.language ? { language: input.language } : {}),
        page: input.page,
      },
      ctx,
    );

    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    ctx.enrich.total(result.total_results);
    if (result.results.length === 0) {
      ctx.enrich.notice(
        'No trending results returned — try the other time_window or a specific media_type.',
      );
    }

    return result;
  },

  format: (result) => {
    if (result.results.length === 0) {
      return [{ type: 'text', text: `No trending results (${result.total_results} total).` }];
    }
    const lines = [
      `**${result.total_results} trending** (page ${result.page}/${result.total_pages})\n`,
    ];
    for (const r of result.results) lines.push(`- ${renderSummaryItem(r)}`);
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
