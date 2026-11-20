/**
 * @fileoverview tmdb_get_movie — full movie detail in one call via append_to_response.
 * @module mcp-server/tools/definitions/tmdb-get-movie.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { escapeMarkdownInline, markdownImage, markdownLink } from '@cyanheads/mcp-ts-core/utils';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import {
  CastMemberSchema,
  CrewMemberSchema,
  detailEnrichment,
  GenreSchema,
  renderCast,
  renderCrew,
  renderGenres,
  renderSummaryList,
  renderTitleCreditsPage,
  renderTrailer,
  SummaryItemSchema,
  TMDB_ATTRIBUTION,
  TrailerSchema,
  titleCreditsNoticeTrailer,
  titleCreditsPage,
  titleCreditsPageFields,
  titleCreditsPageInput,
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
    'Fetch movie detail by TMDB id, including synopsis, runtime, genres, release date, US certification, budget, revenue, ratings, trailers, images, recommendations, similar titles, keywords, and external ids. With credits appended, credits_page pages cast and crew independently in TMDB order, with totals and a continuation. Collection metadata is included for movies that belong to a collection. Append "collection" to also fetch its movies in release order. Use tmdb_get_watch_providers for streaming availability.',
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
      .array(z.enum([...APPEND_VALUES, 'collection']))
      .default([...APPEND_VALUES])
      .describe(
        'Sub-resources to fetch. Defaults to all except "collection", which makes a second request for the collection movies when applicable. Set ["credits"] for cast and crew only.',
      ),
    credits_page: titleCreditsPageInput,
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
      .describe('Current cast page in TMDB order. Present when credits requested.'),
    crew: z
      .array(CrewMemberSchema)
      .optional()
      .describe('Current crew page in TMDB order. Present when credits requested.'),
    ...titleCreditsPageFields,
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
    collection: z
      .object({
        id: z.number().describe('TMDB collection id.'),
        name: z.string().describe('Collection name.'),
        poster_url: z
          .string()
          .optional()
          .describe('Full collection poster URL. Omitted when none.'),
        parts: z
          .array(SummaryItemSchema)
          .optional()
          .describe(
            'Collection movies in ascending release-date order with undated movies last. Present when collection requested.',
          ),
      })
      .optional()
      .describe('Collection membership. Omitted for movies without a collection.'),
  }),
  enrichment: detailEnrichment,
  enrichmentTrailer: titleCreditsNoticeTrailer,
  errors: [
    {
      reason: 'movie_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given movie id.',
      recovery:
        'Verify the id with tmdb_search_titles (mode "movie") — TMDB keys on integer ids, not titles.',
      thrownBy: 'service',
    },
    {
      reason: 'collection_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the movie’s collection while fetching its parts.',
      recovery:
        'Retry without "collection" in append to retrieve the movie detail and collection metadata only.',
      thrownBy: 'service',
    },
  ],

  async handler(input, ctx) {
    const movie = await getTmdbService().getMovie(
      input.movie_id,
      input.append,
      ctx,
      input.language,
      input.credits_page,
    );
    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    const page = titleCreditsPage(movie, input.credits_page);
    if (page.next_credits_page !== undefined) {
      const { movie_id, append, language } = input;
      const next = { movie_id, append, language, credits_page: page.next_credits_page };
      ctx.enrich.notice(`tmdb_get_movie(${JSON.stringify(next)})`);
    }
    return { ...movie, ...page };
  },

  format: (m) => {
    const lines = [`**${escapeMarkdownInline(m.title)}**`];
    if (m.original_title) lines.push(escapeMarkdownInline(m.original_title));
    if (m.tagline) lines.push(escapeMarkdownInline(m.tagline));
    const facts = [
      `**id:** ${m.id}`,
      `**rating:** ${m.vote_average.toFixed(1)} (${m.vote_count} votes)`,
      `**popularity:** ${m.popularity.toFixed(1)}`,
    ];
    if (m.release_date) facts.push(`**released:** ${escapeMarkdownInline(m.release_date)}`);
    if (m.status) facts.push(`**status:** ${escapeMarkdownInline(m.status)}`);
    if (m.runtime_minutes) facts.push(`**runtime:** ${m.runtime_minutes} min`);
    if (m.us_certification) facts.push(`**rated:** ${escapeMarkdownInline(m.us_certification)}`);
    lines.push(facts.join(' | '));
    if (m.genres.length) lines.push(`**genres:** ${renderGenres(m.genres)}`);
    if (m.budget) lines.push(`**budget:** $${m.budget.toLocaleString()}`);
    if (m.revenue) lines.push(`**revenue:** $${m.revenue.toLocaleString()}`);
    if (m.imdb_id) lines.push(`**imdb:** ${escapeMarkdownInline(m.imdb_id)}`);
    if (m.homepage) lines.push(markdownLink('homepage', m.homepage));
    if (m.overview) lines.push(`\n${escapeMarkdownInline(m.overview)}`);
    if (m.poster_url) lines.push(markdownImage('poster', m.poster_url));
    if (m.backdrop_url) lines.push(markdownImage('backdrop', m.backdrop_url));
    lines.push(...renderTitleCreditsPage(m));
    if (m.cast) {
      lines.push(
        '\n**Cast:**',
        ...(m.cast.length ? m.cast.map((c) => `- ${renderCast(c)}`) : ['None on this page.']),
      );
    }
    if (m.crew) {
      lines.push(
        '\n**Crew:**',
        ...(m.crew.length ? m.crew.map((c) => `- ${renderCrew(c)}`) : ['None on this page.']),
      );
    }
    if (m.crew_key?.length)
      lines.push('\n**Key crew:**', ...m.crew_key.map((c) => `- ${renderCrew(c)}`));
    if (m.trailers?.length)
      lines.push('\n**Trailers:**', ...m.trailers.map((t) => `- ${renderTrailer(t)}`));
    if (m.keywords?.length) lines.push(`\n**Keywords:** ${renderGenres(m.keywords)}`);
    lines.push(...renderSummaryList('Recommendations', m.recommendations));
    lines.push(...renderSummaryList('Similar', m.similar));
    if (m.collection) {
      const { id, name, poster_url, parts } = m.collection;
      lines.push(`\n**Collection:** ${escapeMarkdownInline(name)} (id ${id})`);
      if (poster_url) lines.push(markdownImage('collection poster', poster_url));
      if (parts) {
        lines.push(
          ...(parts.length
            ? renderSummaryList('Collection parts', parts)
            : ['No collection parts.']),
        );
      }
    }
    if (m.external_ids) {
      lines.push(
        `\n**External ids:** ${Object.entries(m.external_ids)
          .map(([k, v]) => `${escapeMarkdownInline(k)}=${escapeMarkdownInline(v)}`)
          .join(', ')}`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
