/**
 * @fileoverview tmdb_get_show — full TV show detail in one call via append_to_response.
 * Mirror of tmdb_get_movie for series.
 * @module mcp-server/tools/definitions/tmdb-get-show.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService, type ShowAppend } from '@/services/tmdb/tmdb-service.js';
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
  'content_ratings',
] as const;

const EpisodeSummarySchema = z
  .object({
    id: z.number().optional().describe('TMDB episode id. Omitted when absent.'),
    name: z.string().describe('Episode title.'),
    overview: z.string().optional().describe('Episode synopsis. Omitted when absent.'),
    air_date: z.string().optional().describe('Air date (YYYY-MM-DD). Omitted when absent.'),
    episode_number: z
      .number()
      .optional()
      .describe('Episode number within the season. Omitted when absent.'),
    season_number: z.number().optional().describe('Season number. Omitted when absent.'),
    vote_average: z.number().optional().describe('Average rating, 0–10. Omitted when absent.'),
    still_url: z.string().optional().describe('Full still image URL. Omitted when none.'),
  })
  .describe('A compact episode summary (last/next aired).');

export const tmdbGetShow = tool('tmdb_get_show', {
  title: 'tmdb-mcp-server: get show',
  description:
    'Fetch full TV show detail by TMDB series id in a single call. Returns overview, genres, first/last air date, status, season and episode counts, creators, networks, season summaries, top cast and key crew, YouTube trailers, US content rating, recommendations, similar shows, keywords, and external ids. The series mirror of tmdb_get_movie; sub-resources fold in via append_to_response. Pass a season_number from seasons[] to tmdb_get_season for the episode list. Does not include streaming availability — use tmdb_get_watch_providers.',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    series_id: z
      .number()
      .int()
      .positive()
      .describe(
        'TMDB TV series id. From tmdb_search_titles (mode "tv"/"multi") or tmdb_discover_titles.',
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
        'Sub-resources to fold into the single request. Defaults to the full set. Trim to reduce payload (e.g. ["credits"]).',
      ),
  }),
  output: z.object({
    id: z.number().describe('TMDB series id.'),
    name: z.string().describe('Show name.'),
    original_name: z
      .string()
      .optional()
      .describe('Original-language name. Omitted when same/absent.'),
    tagline: z.string().optional().describe('Tagline. Omitted when absent.'),
    overview: z.string().optional().describe('Synopsis. Omitted when absent.'),
    status: z
      .string()
      .optional()
      .describe('Status (e.g. "Returning Series", "Ended"). Omitted when absent.'),
    first_air_date: z
      .string()
      .optional()
      .describe('First air date (YYYY-MM-DD). Omitted when absent.'),
    last_air_date: z
      .string()
      .optional()
      .describe('Most recent air date (YYYY-MM-DD). Omitted when absent.'),
    number_of_seasons: z.number().describe('Total seasons.'),
    number_of_episodes: z.number().describe('Total episodes.'),
    episode_run_time: z
      .array(z.number())
      .optional()
      .describe('Typical episode runtimes in minutes. Omitted when absent.'),
    genres: z.array(GenreSchema).describe('Genres (full {id,name}).'),
    vote_average: z.number().describe('Average rating, 0–10.'),
    vote_count: z.number().describe('Number of votes.'),
    popularity: z.number().describe('TMDB popularity score.'),
    homepage: z.string().optional().describe('Official homepage URL. Omitted when absent.'),
    in_production: z.boolean().describe('Whether the show is still in production.'),
    type: z.string().optional().describe('Show type (e.g. "Scripted"). Omitted when absent.'),
    us_content_rating: z
      .string()
      .optional()
      .describe(
        'US TV content rating (e.g. "TV-MA"). From content_ratings; omitted when not requested/absent.',
      ),
    poster_url: z.string().optional().describe('Full poster image URL. Omitted when none.'),
    backdrop_url: z.string().optional().describe('Full backdrop image URL. Omitted when none.'),
    created_by: z.array(CastMemberSchema).optional().describe('Creators. Omitted when absent.'),
    networks: z
      .array(
        z
          .object({
            id: z.number().describe('Network id — pass to tmdb_discover_titles with_networks.'),
            name: z.string().describe('Network name.'),
            logo_url: z.string().optional().describe('Full logo URL. Omitted when none.'),
            origin_country: z
              .string()
              .optional()
              .describe('Origin country code. Omitted when absent.'),
          })
          .describe('A network the show aired on.'),
      )
      .optional()
      .describe('Networks the show aired on. Omitted when absent.'),
    seasons: z
      .array(
        z
          .object({
            season_number: z
              .number()
              .describe('Season number (0 = Specials). Pass to tmdb_get_season.'),
            name: z.string().describe('Season name.'),
            episode_count: z.number().describe('Episodes in the season.'),
            air_date: z
              .string()
              .optional()
              .describe('Season air date (YYYY-MM-DD). Omitted when absent.'),
            overview: z.string().optional().describe('Season synopsis. Omitted when absent.'),
            poster_url: z.string().optional().describe('Full poster URL. Omitted when none.'),
          })
          .describe('A season summary.'),
      )
      .describe('Season summaries — pass season_number to tmdb_get_season for episodes.'),
    last_episode_to_air: EpisodeSummarySchema.optional().describe(
      'Most recently aired episode. Omitted when absent.',
    ),
    next_episode_to_air: EpisodeSummarySchema.optional().describe(
      'Next scheduled episode. Omitted when absent.',
    ),
    cast: z
      .array(CastMemberSchema)
      .optional()
      .describe('Top-billed cast (capped). Present when credits requested.'),
    crew_key: z
      .array(CrewMemberSchema)
      .optional()
      .describe('Key crew. Present when credits requested.'),
    trailers: z
      .array(TrailerSchema)
      .optional()
      .describe('YouTube trailers/teasers. Present when videos requested.'),
    recommendations: z
      .array(SummaryItemSchema)
      .optional()
      .describe('Recommended shows. Present when requested.'),
    similar: z
      .array(SummaryItemSchema)
      .optional()
      .describe('Similar shows. Present when requested.'),
    keywords: z
      .array(GenreSchema)
      .optional()
      .describe('Keyword tags. Present when keywords requested.'),
    external_ids: z
      .record(z.string(), z.string())
      .optional()
      .describe('Cross-platform ids. Present when external_ids requested.'),
  }),
  enrichment: detailEnrichment,
  errors: [
    {
      reason: 'show_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given series id.',
      recovery:
        'Verify the id with tmdb_search_titles (mode "tv") — TMDB keys on integer ids, not titles.',
    },
  ],

  async handler(input, ctx) {
    const show = await getTmdbService().getShow(
      input.series_id,
      input.append as ShowAppend[],
      ctx,
      input.language,
    );
    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    return show;
  },

  format: (s) => {
    const lines = [`# ${s.name}`];
    if (s.original_name) lines.push(`*${s.original_name}*`);
    if (s.tagline) lines.push(`_${s.tagline}_`);
    const facts = [
      `**id:** ${s.id}`,
      `**rating:** ${s.vote_average.toFixed(1)} (${s.vote_count} votes)`,
      `**popularity:** ${s.popularity.toFixed(1)}`,
      `**seasons:** ${s.number_of_seasons}`,
      `**episodes:** ${s.number_of_episodes}`,
      `**in production:** ${s.in_production ? 'yes' : 'no'}`,
    ];
    if (s.first_air_date) facts.push(`**first aired:** ${s.first_air_date}`);
    if (s.last_air_date) facts.push(`**last aired:** ${s.last_air_date}`);
    if (s.status) facts.push(`**status:** ${s.status}`);
    if (s.type) facts.push(`**type:** ${s.type}`);
    if (s.us_content_rating) facts.push(`**rated:** ${s.us_content_rating}`);
    if (s.episode_run_time?.length)
      facts.push(`**episode runtime:** ${s.episode_run_time.join('/')} min`);
    lines.push(facts.join(' | '));
    if (s.genres.length) lines.push(`**genres:** ${renderGenres(s.genres)}`);
    if (s.homepage) lines.push(`**homepage:** ${s.homepage}`);
    if (s.overview) lines.push(`\n${s.overview}`);
    if (s.poster_url) lines.push(`![poster](${s.poster_url})`);
    if (s.backdrop_url) lines.push(`![backdrop](${s.backdrop_url})`);
    if (s.created_by?.length)
      lines.push('\n**Created by:**', ...s.created_by.map((c) => `- ${renderCast(c)}`));
    if (s.networks?.length) {
      lines.push('\n**Networks:**');
      for (const n of s.networks) {
        lines.push(
          `- ${n.name} (id ${n.id})${n.origin_country ? ` — ${n.origin_country}` : ''}${n.logo_url ? ` logo ${n.logo_url}` : ''}`,
        );
      }
    }
    if (s.seasons.length) {
      lines.push('\n**Seasons:**');
      for (const se of s.seasons) {
        const air = se.air_date ? `, ${se.air_date}` : '';
        lines.push(
          `- S${se.season_number} ${se.name} — ${se.episode_count} episodes${air}${se.poster_url ? ` poster ${se.poster_url}` : ''}`,
        );
        if (se.overview) lines.push(`  ${se.overview}`);
      }
    }
    if (s.last_episode_to_air)
      lines.push(`\n**Last aired:** ${formatEpisode(s.last_episode_to_air)}`);
    if (s.next_episode_to_air) lines.push(`**Next:** ${formatEpisode(s.next_episode_to_air)}`);
    if (s.cast?.length) lines.push('\n**Cast:**', ...s.cast.map((c) => `- ${renderCast(c)}`));
    if (s.crew_key?.length)
      lines.push('\n**Key crew:**', ...s.crew_key.map((c) => `- ${renderCrew(c)}`));
    if (s.trailers?.length)
      lines.push('\n**Trailers:**', ...s.trailers.map((t) => `- ${renderTrailer(t)}`));
    if (s.keywords?.length) lines.push(`\n**Keywords:** ${renderGenres(s.keywords)}`);
    lines.push(...renderSummaryList('Recommendations', s.recommendations));
    lines.push(...renderSummaryList('Similar', s.similar));
    if (s.external_ids)
      lines.push(
        `\n**External ids:** ${Object.entries(s.external_ids)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      );
    return [{ type: 'text', text: lines.join('\n') }];
  },
});

function formatEpisode(e: z.infer<typeof EpisodeSummarySchema>): string {
  const parts: string[] = [];
  if (e.season_number !== undefined && e.episode_number !== undefined) {
    parts.push(`S${e.season_number}E${e.episode_number}`);
  }
  parts.push(e.name);
  if (e.id !== undefined) parts.push(`(${e.id})`);
  if (e.air_date) parts.push(`— ${e.air_date}`);
  if (e.vote_average !== undefined) parts.push(`★${e.vote_average.toFixed(1)}`);
  let line = parts.join(' ');
  if (e.overview) line += ` — ${e.overview}`;
  if (e.still_url) line += ` ${e.still_url}`;
  return line;
}
