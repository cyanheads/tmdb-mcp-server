/**
 * @fileoverview tmdb_get_person — person detail + full filmography (combined_credits).
 * Credits are year-ordered and paged independently across cast and crew.
 * @module mcp-server/tools/definitions/tmdb-get-person.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { escapeMarkdownInline, markdownImage, markdownLink } from '@cyanheads/mcp-ts-core/utils';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import { MediaTypeSchema, noticeTrailer, TMDB_ATTRIBUTION } from './_shared.js';

const PersonCastCreditSchema = z
  .object({
    id: z
      .number()
      .describe('TMDB id of the title — pass to tmdb_get_movie/tmdb_get_show per media_type.'),
    media_type: MediaTypeSchema,
    title: z.string().describe('Title or name of the credit.'),
    character: z.string().optional().describe('Character played. Omitted when absent.'),
    release_year: z.number().optional().describe('Release/first-air year. Omitted when unknown.'),
    vote_average: z.number().optional().describe('Average rating, 0–10. Omitted when absent.'),
    poster_url: z.string().optional().describe('Full poster URL. Omitted when none.'),
  })
  .describe('A cast credit from the combined filmography.');

const PersonCrewCreditSchema = z
  .object({
    id: z
      .number()
      .describe('TMDB id of the title — pass to tmdb_get_movie/tmdb_get_show per media_type.'),
    media_type: MediaTypeSchema,
    title: z.string().describe('Title or name of the credit.'),
    job: z.string().describe('Job (e.g. "Director", "Writer").'),
    department: z.string().optional().describe('Department. Omitted when absent.'),
    release_year: z.number().optional().describe('Release/first-air year. Omitted when unknown.'),
    poster_url: z.string().optional().describe('Full poster URL. Omitted when none.'),
  })
  .describe('A crew credit from the combined filmography.');

export const tmdbGetPerson = tool('tmdb_get_person', {
  title: 'tmdb-mcp-server: get person',
  description:
    'Fetch person detail and filmography by TMDB person id. Returns biography, birth/death dates, place of birth, known-for department, aliases, gender, and combined cast and crew credits. credits_page selects 50 entries per list, ordered by release year descending with unknown years last; ties keep TMDB order. Totals and next_credits_page support retrieving every credit. Also returns IMDb and cross-platform ids (Wikidata, social handles).',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    credits_page: z
      .number()
      .int()
      .positive()
      .default(1)
      .describe(
        'Filmography page (1-indexed), up to 50 cast and 50 crew credits independently per page. Past-end pages return empty lists.',
      ),
    person_id: z
      .number()
      .int()
      .positive()
      .describe('TMDB person id. From tmdb_search_titles (mode "person"/"multi").'),
    language: z
      .string()
      .optional()
      .describe(
        'Response language (ISO 639-1[-COUNTRY]). Defaults to the server-configured language.',
      ),
  }),
  output: z.object({
    credits_page: z.number().describe('Current filmography page (1-indexed).'),
    next_credits_page: z
      .number()
      .optional()
      .describe(
        'Next filmography page when either list has remaining credits. Omitted after exhaustion.',
      ),
    id: z.number().describe('TMDB person id.'),
    name: z.string().describe('Person name.'),
    biography: z.string().optional().describe('Biography. Omitted when absent.'),
    birthday: z.string().optional().describe('Birth date (YYYY-MM-DD). Omitted when absent.'),
    deathday: z.string().optional().describe('Death date (YYYY-MM-DD). Omitted when absent/alive.'),
    place_of_birth: z.string().optional().describe('Place of birth. Omitted when absent.'),
    known_for_department: z
      .string()
      .optional()
      .describe('Primary department (e.g. "Acting"). Omitted when absent.'),
    also_known_as: z
      .array(z.string())
      .optional()
      .describe('Alternate names/aliases. Omitted when none.'),
    gender: z
      .enum(['unknown', 'female', 'male', 'non-binary'])
      .optional()
      .describe("Gender label mapped from TMDB's numeric code. Omitted when absent."),
    popularity: z.number().describe('TMDB popularity score.'),
    homepage: z.string().optional().describe('Official homepage URL. Omitted when absent.'),
    imdb_id: z.string().optional().describe('IMDb id (nm-prefixed). Omitted when absent.'),
    profile_url: z.string().optional().describe('Full profile image URL. Omitted when none.'),
    cast_credits: z
      .array(PersonCastCreditSchema)
      .describe(
        'Current cast filmography page (up to 50, release-year descending; ties keep TMDB order).',
      ),
    crew_credits: z
      .array(PersonCrewCreditSchema)
      .describe(
        'Current crew filmography page (up to 50, release-year descending; ties keep TMDB order).',
      ),
    cast_credits_total: z.number().describe('Total cast credits across all pages.'),
    crew_credits_total: z.number().describe('Total crew credits across all pages.'),
    external_ids: z
      .record(z.string(), z.string())
      .optional()
      .describe('Cross-platform ids (imdb_id, wikidata_id, social handles). Omitted when none.'),
  }),
  enrichment: {
    attribution: z.string().describe(TMDB_ATTRIBUTION),
    totalCount: z.number().describe('Total combined credits (cast + crew) across all pages.'),
    truncated: z.boolean().optional().describe('True when another filmography page is available.'),
    shown: z.number().optional().describe('Total credits returned across both lists.'),
    cap: z.number().optional().describe('Per-list display cap that was applied.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Current-page disclosure and executable continuation when another page is available.',
      ),
  },
  enrichmentTrailer: noticeTrailer,
  errors: [
    {
      reason: 'person_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given person id.',
      recovery: 'Verify the id with tmdb_search_titles (mode "person").',
      thrownBy: 'service',
    },
  ],

  async handler(input, ctx) {
    const person = await getTmdbService().getPerson(
      input.person_id,
      ctx,
      input.language,
      input.credits_page,
    );

    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    ctx.enrich.total(person.cast_credits_total + person.crew_credits_total);

    const hasNext =
      input.credits_page * 50 < Math.max(person.cast_credits_total, person.crew_credits_total);
    if (hasNext) {
      const continuation = {
        person_id: input.person_id,
        credits_page: input.credits_page + 1,
        ...(input.language !== undefined ? { language: input.language } : {}),
      };
      ctx.enrich.truncated({
        shown: person.cast_credits.length + person.crew_credits.length,
        cap: 50,
        guidance: `Credits page ${input.credits_page} is capped at 50 per list (cast ${person.cast_credits_total}, crew ${person.crew_credits_total} total). Continue with tmdb_get_person(${JSON.stringify(continuation)}).`,
      });
    }

    return {
      ...person,
      credits_page: input.credits_page,
      ...(hasNext ? { next_credits_page: input.credits_page + 1 } : {}),
    };
  },

  format: (p) => {
    const lines = [`**${escapeMarkdownInline(p.name)}**`];
    lines.push(
      `Credits page: ${p.credits_page}${p.next_credits_page !== undefined ? ` | Next credits page: ${p.next_credits_page}` : ''}`,
    );
    const facts = [`**id:** ${p.id}`, `**popularity:** ${p.popularity.toFixed(1)}`];
    if (p.known_for_department)
      facts.push(`**known for:** ${escapeMarkdownInline(p.known_for_department)}`);
    if (p.gender) facts.push(`**gender:** ${p.gender}`);
    if (p.birthday) facts.push(`**born:** ${escapeMarkdownInline(p.birthday)}`);
    if (p.deathday) facts.push(`**died:** ${escapeMarkdownInline(p.deathday)}`);
    if (p.place_of_birth) facts.push(`**birthplace:** ${escapeMarkdownInline(p.place_of_birth)}`);
    if (p.imdb_id) facts.push(`**imdb:** ${escapeMarkdownInline(p.imdb_id)}`);
    lines.push(facts.join(' | '));
    if (p.homepage) lines.push(markdownLink('homepage', p.homepage));
    if (p.also_known_as?.length)
      lines.push(`**also known as:** ${p.also_known_as.map(escapeMarkdownInline).join(', ')}`);
    if (p.profile_url) lines.push(markdownImage('profile', p.profile_url));
    if (p.biography) lines.push(`\n${escapeMarkdownInline(p.biography)}`);
    if (p.external_ids)
      lines.push(
        `\n**External ids:** ${Object.entries(p.external_ids)
          .map(([k, v]) => `${escapeMarkdownInline(k)}=${escapeMarkdownInline(v)}`)
          .join(', ')}`,
      );

    lines.push(`\n**Cast credits** (${p.cast_credits.length} of ${p.cast_credits_total}):`);
    for (const c of p.cast_credits) {
      const yr = c.release_year ? ` (${c.release_year})` : '';
      const rating = c.vote_average !== undefined ? ` ★${c.vote_average.toFixed(1)}` : '';
      const poster = c.poster_url ? ` ${markdownImage('poster', c.poster_url)}` : '';
      lines.push(
        `- ${escapeMarkdownInline(c.title)}${yr} [${c.media_type}, id ${c.id}]${c.character ? ` as ${escapeMarkdownInline(c.character)}` : ''}${rating}${poster}`,
      );
    }

    lines.push(`\n**Crew credits** (${p.crew_credits.length} of ${p.crew_credits_total}):`);
    for (const c of p.crew_credits) {
      const yr = c.release_year ? ` (${c.release_year})` : '';
      const dept = c.department ? `, ${escapeMarkdownInline(c.department)}` : '';
      const poster = c.poster_url ? ` ${markdownImage('poster', c.poster_url)}` : '';
      lines.push(
        `- ${escapeMarkdownInline(c.title)}${yr} [${c.media_type}, id ${c.id}] — ${escapeMarkdownInline(c.job)}${dept}${poster}`,
      );
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
