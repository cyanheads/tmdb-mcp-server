/**
 * @fileoverview tmdb_get_season — episode list for one season. Bridges the show-level
 * summary and per-episode detail. series_id is echoed from input (the season endpoint
 * does not return it).
 * @module mcp-server/tools/definitions/tmdb-get-season.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import { CastMemberSchema, detailEnrichment, renderCast, TMDB_ATTRIBUTION } from './_shared.js';

export const tmdbGetSeason = tool('tmdb_get_season', {
  title: 'tmdb-mcp-server: get season',
  description:
    'Fetch the episode list for one season of a TV show. Returns episode names, air dates, overviews, runtimes, vote averages, still URLs, and per-episode guest stars, plus the season\'s regular recurring cast. Bridges the show-level summary (tmdb_get_show) and per-episode detail. Discover valid season numbers from tmdb_get_show (seasons[].season_number); season 0 is "Specials".',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    series_id: z
      .number()
      .int()
      .positive()
      .describe('TMDB TV series id (from tmdb_search_titles or tmdb_get_show).'),
    season_number: z
      .number()
      .int()
      .min(0)
      .describe(
        'Season number. 0 is the "Specials" season on TMDB. Discover valid numbers from tmdb_get_show (seasons[].season_number).',
      ),
    language: z
      .string()
      .optional()
      .describe(
        'Response language (ISO 639-1[-COUNTRY]). Defaults to the server-configured language.',
      ),
  }),
  output: z.object({
    series_id: z
      .number()
      .describe('The series id (echoed from input — the season endpoint does not return it).'),
    season_number: z.number().describe('Season number.'),
    name: z.string().describe('Season name.'),
    overview: z.string().optional().describe('Season synopsis. Omitted when absent.'),
    air_date: z.string().optional().describe('Season air date (YYYY-MM-DD). Omitted when absent.'),
    vote_average: z
      .number()
      .optional()
      .describe('Season-level aggregate rating, 0–10. Omitted when absent.'),
    poster_url: z.string().optional().describe('Full poster image URL. Omitted when none.'),
    regular_cast: z
      .array(CastMemberSchema)
      .optional()
      .describe(
        "The season's regular recurring cast (distinct from per-episode guest stars). Omitted when absent.",
      ),
    episodes: z
      .array(
        z
          .object({
            episode_number: z.number().describe('Episode number within the season.'),
            name: z.string().describe('Episode title.'),
            overview: z.string().optional().describe('Episode synopsis. Omitted when absent.'),
            air_date: z.string().optional().describe('Air date (YYYY-MM-DD). Omitted when absent.'),
            runtime_minutes: z
              .number()
              .optional()
              .describe('Runtime in minutes. Omitted when absent.'),
            vote_average: z
              .number()
              .optional()
              .describe('Average rating, 0–10. Omitted when absent.'),
            still_url: z.string().optional().describe('Full still image URL. Omitted when none.'),
            guest_stars: z
              .array(CastMemberSchema)
              .optional()
              .describe('Guest stars in this episode (embedded per-episode). Omitted when none.'),
          })
          .describe('An episode in the season.'),
      )
      .describe('Episodes in the season, in order.'),
  }),
  enrichment: detailEnrichment,
  errors: [
    {
      reason: 'season_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 — the series id is wrong or the season number does not exist for this show.',
      recovery:
        'Confirm the series id and list valid season numbers with tmdb_get_show (seasons[].season_number) before retrying.',
    },
  ],

  async handler(input, ctx) {
    const season = await getTmdbService().getSeason(
      input.series_id,
      input.season_number,
      ctx,
      input.language,
    );
    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    return season;
  },

  format: (s) => {
    const lines = [`# ${s.name} (series ${s.series_id}, season ${s.season_number})`];
    const facts: string[] = [];
    if (s.air_date) facts.push(`**air date:** ${s.air_date}`);
    if (s.vote_average !== undefined) facts.push(`**rating:** ${s.vote_average.toFixed(1)}`);
    facts.push(`**episodes:** ${s.episodes.length}`);
    lines.push(facts.join(' | '));
    if (s.poster_url) lines.push(`![poster](${s.poster_url})`);
    if (s.overview) lines.push(`\n${s.overview}`);
    if (s.regular_cast?.length) {
      lines.push('\n**Regular cast:**', ...s.regular_cast.map((c) => `- ${renderCast(c)}`));
    }
    lines.push('\n**Episodes:**');
    for (const e of s.episodes) {
      const facts2: string[] = [];
      if (e.air_date) facts2.push(e.air_date);
      if (e.runtime_minutes !== undefined) facts2.push(`${e.runtime_minutes} min`);
      if (e.vote_average !== undefined) facts2.push(`★${e.vote_average.toFixed(1)}`);
      lines.push(
        `### E${e.episode_number}: ${e.name}${facts2.length ? ` (${facts2.join(', ')})` : ''}`,
      );
      if (e.overview) lines.push(e.overview);
      if (e.still_url) lines.push(`![still](${e.still_url})`);
      if (e.guest_stars?.length) {
        lines.push('**Guest stars:**', ...e.guest_stars.map((g) => `- ${renderCast(g)}`));
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
