/**
 * @fileoverview tmdb_get_movie — full movie detail in one call via append_to_response.
 * @module mcp-server/tools/definitions/tmdb-get-movie.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService, type MovieAppend } from '@/services/tmdb/tmdb-service.js';
import {
  CastMemberSchema,
  CrewMemberSchema,
  detailEnrichment,
  GenreSchema,
  renderCast,
  renderCrew,
  renderGenres,
  renderSummaryList,
  renderTrailer,
  SummaryItemSchema,
  TMDB_ATTRIBUTION,
  TrailerSchema,
} from './_shared.js';

const APPEND_VALUES = [
  'credits',
  'videos',
  'recommendations',
  'similar',
  'keywords',
  'external_ids',
  'release_dates',
] as const;

export const tmdbGetMovie = tool('tmdb_get_movie', {
  title: 'tmdb-mcp-server: get movie',
  description:
    'Fetch full movie detail by TMDB id in a single call. Returns synopsis, runtime, genres, release date, US certification, budget/revenue, votes, top cast and key crew, YouTube trailers, poster/backdrop URLs, recommendations, similar titles, keywords, and external ids (IMDb, etc.). Sub-resources are folded in via append_to_response — trim the append array to reduce payload. Does not include streaming availability (region-specific) — use tmdb_get_watch_providers for that.',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    movie_id: z
      .number()
      .int()
      .positive()
      .describe(
        'TMDB movie id (integer). Obtain it from tmdb_search_titles (mode "movie" or "multi") or tmdb_discover_titles.',
      ),
    language: z
      .string()
      .optional()
      .describe(
        'Response language (ISO 639-1[-COUNTRY]). Defaults to the server-configured language.',
      ),
    append: z
      .array(z.enum(APPEND_VALUES))
      .default([...APPEND_VALUES])
      .describe(
        'Sub-resources to fold into the single request. Defaults to the full set. Trim it to reduce payload when you only need part of the record (e.g. ["credits"] for cast only).',
      ),
  }),
  output: z.object({
    id: z.number().describe('TMDB movie id.'),
    title: z.string().describe('Movie title.'),
    original_title: z
      .string()
      .optional()
      .describe('Original-language title. Omitted when same as title or absent.'),
    tagline: z.string().optional().describe('Tagline. Omitted when absent.'),
    overview: z.string().optional().describe('Synopsis. Omitted when absent.'),
    status: z
      .string()
      .optional()
      .describe('Release status (e.g. "Released"). Omitted when absent.'),
    release_date: z
      .string()
      .optional()
      .describe('Primary release date (YYYY-MM-DD). Omitted when absent.'),
    runtime_minutes: z.number().optional().describe('Runtime in minutes. Omitted when absent.'),
    genres: z.array(GenreSchema).describe('Genres (full {id,name}).'),
    vote_average: z.number().describe('Average rating, 0–10.'),
    vote_count: z.number().describe('Number of votes.'),
    popularity: z.number().describe('TMDB popularity score.'),
    budget: z.number().optional().describe('Budget in USD. Omitted when zero/unknown.'),
    revenue: z
      .number()
      .optional()
      .describe('Box-office revenue in USD. Omitted when zero/unknown.'),
    homepage: z.string().optional().describe('Official homepage URL. Omitted when absent.'),
    imdb_id: z.string().optional().describe('IMDb id (tt-prefixed). Omitted when absent.'),
    us_certification: z
      .string()
      .optional()
      .describe(
        'US theatrical certification (e.g. "R"). From release_dates; omitted when not requested/absent.',
      ),
    poster_url: z.string().optional().describe('Full poster image URL. Omitted when none.'),
    backdrop_url: z.string().optional().describe('Full backdrop image URL. Omitted when none.'),
    cast: z
      .array(CastMemberSchema)
      .optional()
      .describe('Top-billed cast (capped). Present when credits requested.'),
    crew_key: z
      .array(CrewMemberSchema)
      .optional()
      .describe('Key crew (Director/Writer/etc.). Present when credits requested.'),
    trailers: z
      .array(TrailerSchema)
      .optional()
      .describe('YouTube trailers/teasers. Present when videos requested.'),
    recommendations: z
      .array(SummaryItemSchema)
      .optional()
      .describe('Recommended titles. Present when requested.'),
    similar: z
      .array(SummaryItemSchema)
      .optional()
      .describe('Similar titles. Present when requested.'),
    keywords: z
      .array(GenreSchema)
      .optional()
      .describe('Keyword tags. Present when keywords requested.'),
    external_ids: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Cross-platform ids (imdb_id, wikidata_id, etc.). Present when external_ids requested.',
      ),
  }),
  enrichment: detailEnrichment,
  errors: [
    {
      reason: 'movie_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given movie id.',
      recovery:
        'Verify the id with tmdb_search_titles (mode "movie") — TMDB keys on integer ids, not titles.',
    },
  ],

  async handler(input, ctx) {
    const movie = await getTmdbService().getMovie(
      input.movie_id,
      input.append as MovieAppend[],
      ctx,
      input.language,
    );
    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    return movie;
  },

  format: (m) => {
    const lines = [`# ${m.title}`];
    if (m.original_title) lines.push(`*${m.original_title}*`);
    if (m.tagline) lines.push(`_${m.tagline}_`);
    const facts = [
      `**id:** ${m.id}`,
      `**rating:** ${m.vote_average.toFixed(1)} (${m.vote_count} votes)`,
      `**popularity:** ${m.popularity.toFixed(1)}`,
    ];
    if (m.release_date) facts.push(`**released:** ${m.release_date}`);
    if (m.status) facts.push(`**status:** ${m.status}`);
    if (m.runtime_minutes) facts.push(`**runtime:** ${m.runtime_minutes} min`);
    if (m.us_certification) facts.push(`**rated:** ${m.us_certification}`);
    lines.push(facts.join(' | '));
    if (m.genres.length) lines.push(`**genres:** ${renderGenres(m.genres)}`);
    if (m.budget) lines.push(`**budget:** $${m.budget.toLocaleString()}`);
    if (m.revenue) lines.push(`**revenue:** $${m.revenue.toLocaleString()}`);
    if (m.imdb_id) lines.push(`**imdb:** ${m.imdb_id}`);
    if (m.homepage) lines.push(`**homepage:** ${m.homepage}`);
    if (m.overview) lines.push(`\n${m.overview}`);
    if (m.poster_url) lines.push(`![poster](${m.poster_url})`);
    if (m.backdrop_url) lines.push(`![backdrop](${m.backdrop_url})`);
    if (m.cast?.length) lines.push('\n**Cast:**', ...m.cast.map((c) => `- ${renderCast(c)}`));
    if (m.crew_key?.length)
      lines.push('\n**Key crew:**', ...m.crew_key.map((c) => `- ${renderCrew(c)}`));
    if (m.trailers?.length)
      lines.push('\n**Trailers:**', ...m.trailers.map((t) => `- ${renderTrailer(t)}`));
    if (m.keywords?.length) lines.push(`\n**Keywords:** ${renderGenres(m.keywords)}`);
    lines.push(...renderSummaryList('Recommendations', m.recommendations));
    lines.push(...renderSummaryList('Similar', m.similar));
    if (m.external_ids) {
      lines.push(
        `\n**External ids:** ${Object.entries(m.external_ids)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
