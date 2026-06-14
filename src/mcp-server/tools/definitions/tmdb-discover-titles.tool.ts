/**
 * @fileoverview tmdb_discover_titles — the power-query. Filtered, sorted discovery
 * across movies or TV. Range/filter params translate to TMDB's dot notation in the
 * service layer; arrays join with ',' (AND, genres) or '|' (OR, cast/crew/network/provider).
 * @module mcp-server/tools/definitions/tmdb-discover-titles.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { type DiscoverParams, getTmdbService } from '@/services/tmdb/tmdb-service.js';
import {
  listEnrichment,
  renderSummaryItem,
  SummaryItemSchema,
  TMDB_ATTRIBUTION,
} from './_shared.js';

const dateField = (label: string) =>
  z
    .union([
      z.literal(''),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(label),
    ])
    .optional();

export const tmdbDiscoverTitles = tool('tmdb_discover_titles', {
  title: 'tmdb-mcp-server: discover titles',
  description:
    'Filtered, sorted discovery across movies or TV — the power-query entry point. Filter by genre(s), release-year or date range, vote range, vote-count floor, cast/crew (movie), network (tv), watch providers + region, original language, and runtime; sort by popularity, revenue, vote average, vote count, or release date. Genre ids and person/network ids come from search results and other tools. Pair vote_average sorting with vote_count_gte to avoid tiny-sample outliers.',
  annotations: { readOnlyHint: true, openWorldHint: true },
  input: z.object({
    media_type: z
      .enum(['movie', 'tv'])
      .describe(
        'Discover movies or TV shows. Determines the endpoint and which genre vocabulary applies.',
      ),
    sort_by: z
      .enum([
        'popularity.desc',
        'popularity.asc',
        'revenue.desc',
        'revenue.asc',
        'primary_release_date.desc',
        'primary_release_date.asc',
        'vote_average.desc',
        'vote_average.asc',
        'vote_count.desc',
        'vote_count.asc',
      ])
      .default('popularity.desc')
      .describe(
        'Sort order. "popularity.desc" (default) for what is broadly relevant now; "vote_average.desc" for critically rated (pair with vote_count_gte to avoid tiny-sample outliers); "revenue.desc" for box office; "primary_release_date.desc" for newest. For tv, primary_release_date.desc sorts by first-air date; avoid first_air_date.desc — TMDB returns bogus future-dated entries for that sort.',
      ),
    with_genres: z
      .array(z.number().int())
      .optional()
      .describe(
        "Genre ids to require (AND — all listed genres must match). Genre ids differ between movie and tv; names appear in any result's genres[]. Combine multiple to narrow (e.g. Action + Comedy).",
      ),
    without_genres: z
      .array(z.number().int())
      .optional()
      .describe('Genre ids to exclude (AND — all listed genres are excluded).'),
    year: z
      .number()
      .int()
      .min(1850)
      .max(2100)
      .optional()
      .describe(
        'Exact primary-release year (movie) / first-air year (tv). For a range, use release_date_gte/lte instead.',
      ),
    release_date_gte: dateField('Earliest release date, inclusive (YYYY-MM-DD).').describe(
      'Earliest release/first-air date, inclusive (YYYY-MM-DD). Pair with release_date_lte for a window.',
    ),
    release_date_lte: dateField('Latest release date, inclusive (YYYY-MM-DD).').describe(
      'Latest release/first-air date, inclusive (YYYY-MM-DD).',
    ),
    vote_average_gte: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe(
        'Minimum average rating (0–10). Use with vote_count_gte so a 10.0 from 3 votes does not dominate.',
      ),
    vote_average_lte: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe('Maximum average rating (0–10).'),
    vote_count_gte: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Minimum number of votes. The single most useful quality gate — set ~100–1000 to exclude obscure or unrated titles when sorting by vote_average.',
      ),
    with_cast: z
      .array(z.number().int())
      .optional()
      .describe(
        'Person ids that must appear in the cast (movie only; silently ignored for tv with a notice). Resolve names to ids with tmdb_search_titles mode "person". Multiple ids match any (OR).',
      ),
    with_crew: z
      .array(z.number().int())
      .optional()
      .describe(
        'Person ids that must appear in the crew (movie only; silently ignored for tv with a notice). Useful for "movies directed by X". Resolve names to ids with tmdb_search_titles mode "person". Multiple ids match any (OR).',
      ),
    with_networks: z
      .array(z.number().int())
      .optional()
      .describe(
        'TV network ids to require (tv only; silently ignored for movie with a notice). Filters to shows that aired on these networks. Known ids: 213 = Netflix, 1024 = Amazon, 2739 = Disney+. Multiple ids match any (OR).',
      ),
    with_original_language: z
      .string()
      .optional()
      .describe(
        'ISO 639-1 original-language code (e.g. "ja" for originally-Japanese titles). Distinct from the response language.',
      ),
    runtime_gte: z.number().int().min(0).optional().describe('Minimum runtime in minutes.'),
    runtime_lte: z.number().int().min(0).optional().describe('Maximum runtime in minutes.'),
    with_watch_providers: z
      .array(z.number().int())
      .optional()
      .describe(
        'Streaming provider ids to require. MUST be paired with watch_region — provider availability is region-specific. Provider ids come from tmdb_get_watch_providers results. Multiple ids match any (OR).',
      ),
    watch_region: z
      .union([
        z.literal(''),
        z
          .string()
          .regex(/^[A-Z]{2}$/)
          .describe('ISO 3166-1 country code (uppercase).'),
      ])
      .optional()
      .describe(
        'Country for with_watch_providers, ISO 3166-1 alpha-2 (e.g. "US"). Required when with_watch_providers is set.',
      ),
    include_adult: z
      .boolean()
      .default(false)
      .describe('Include adult-content results. Default false.'),
    page: z.number().int().min(1).max(500).default(1).describe('Result page (20 per page).'),
  }),
  output: z.object({
    page: z.number().describe('Current page (1-indexed).'),
    total_pages: z.number().describe('Total pages available.'),
    total_results: z.number().describe('Total matching results across all pages.'),
    results: z.array(SummaryItemSchema).describe('Matching summary cards (up to 20 per page).'),
  }),
  enrichment: listEnrichment,
  errors: [
    {
      reason: 'region_required',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'with_watch_providers is set without a watch_region.',
      recovery:
        'Provide watch_region (ISO 3166-1, e.g. "US") — streaming availability is region-specific and cannot be queried globally.',
    },
  ],

  async handler(input, ctx) {
    const providers = input.with_watch_providers?.length ? input.with_watch_providers : undefined;
    const region =
      input.watch_region && input.watch_region.length > 0 ? input.watch_region : undefined;
    if (providers && !region) {
      throw ctx.fail('region_required', undefined, ctx.recoveryFor('region_required'));
    }

    const params: DiscoverParams = {
      media_type: input.media_type,
      sort_by: input.sort_by,
      ...(input.with_genres?.length ? { with_genres: input.with_genres } : {}),
      ...(input.without_genres?.length ? { without_genres: input.without_genres } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.release_date_gte ? { release_date_gte: input.release_date_gte } : {}),
      ...(input.release_date_lte ? { release_date_lte: input.release_date_lte } : {}),
      ...(input.vote_average_gte !== undefined ? { vote_average_gte: input.vote_average_gte } : {}),
      ...(input.vote_average_lte !== undefined ? { vote_average_lte: input.vote_average_lte } : {}),
      ...(input.vote_count_gte !== undefined ? { vote_count_gte: input.vote_count_gte } : {}),
      ...(input.with_cast?.length ? { with_cast: input.with_cast } : {}),
      ...(input.with_crew?.length ? { with_crew: input.with_crew } : {}),
      ...(input.with_networks?.length ? { with_networks: input.with_networks } : {}),
      ...(input.with_original_language
        ? { with_original_language: input.with_original_language }
        : {}),
      ...(input.runtime_gte !== undefined ? { runtime_gte: input.runtime_gte } : {}),
      ...(input.runtime_lte !== undefined ? { runtime_lte: input.runtime_lte } : {}),
      ...(providers && region ? { with_watch_providers: providers, watch_region: region } : {}),
      include_adult: input.include_adult,
      page: input.page,
    };

    const result = await getTmdbService().discover(params, ctx);

    // Collect no-op notices for inapplicable filters, plus empty-result guidance.
    const notices: string[] = [];
    const ignoredForTv: string[] = [];
    const ignoredForMovie: string[] = [];
    if (input.media_type === 'tv') {
      if (input.with_cast?.length) ignoredForTv.push('with_cast');
      if (input.with_crew?.length) ignoredForTv.push('with_crew');
    }
    if (input.media_type === 'movie' && input.with_networks?.length)
      ignoredForMovie.push('with_networks');
    if (ignoredForTv.length)
      notices.push(
        `${ignoredForTv.join(' and ')} ${ignoredForTv.length > 1 ? 'are' : 'is'} movie-only on TMDB and ${ignoredForTv.length > 1 ? 'were' : 'was'} ignored for tv.`,
      );
    if (ignoredForMovie.length)
      notices.push('with_networks is tv-only on TMDB and was ignored for movie.');
    if (result.results.length === 0) {
      notices.push(
        'No titles matched the active filters. Try lowering vote_count_gte, widening the date range, or dropping a genre.',
      );
    }

    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    ctx.enrich.total(result.total_results);
    if (notices.length) ctx.enrich.notice(notices.join(' '));

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
