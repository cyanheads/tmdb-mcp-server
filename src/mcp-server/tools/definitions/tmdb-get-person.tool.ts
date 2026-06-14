/**
 * @fileoverview tmdb_get_person — person detail + full filmography (combined_credits).
 * Credits are recency-ordered and capped to a display size; truncation is disclosed.
 * @module mcp-server/tools/definitions/tmdb-get-person.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import { MediaTypeSchema, TMDB_ATTRIBUTION } from './_shared.js';

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
    'Fetch person detail and full filmography by TMDB person id. Returns biography, birth/death dates, place of birth, known-for department, aliases, gender, and the combined_credits filmography split into cast and crew credits (each recency-ordered, most recent first, capped to a display size — totals disclosed). Also returns IMDb id and the extended cross-platform id set (Wikidata, social handles) for chaining.',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
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
      .describe('Cast filmography (recency-ordered, capped).'),
    crew_credits: z
      .array(PersonCrewCreditSchema)
      .describe('Crew filmography (recency-ordered, capped).'),
    cast_credits_total: z.number().describe('Total cast credits before the display cap.'),
    crew_credits_total: z.number().describe('Total crew credits before the display cap.'),
    external_ids: z
      .record(z.string(), z.string())
      .optional()
      .describe('Cross-platform ids (imdb_id, wikidata_id, social handles). Omitted when none.'),
  }),
  enrichment: {
    attribution: z.string().describe(TMDB_ATTRIBUTION),
    totalCount: z.number().describe('Total combined credits (cast + crew) before any display cap.'),
    truncated: z.boolean().optional().describe('True when either credit list was capped.'),
    shown: z.number().optional().describe('Total credits returned across both lists.'),
    cap: z.number().optional().describe('Per-list display cap that was applied.'),
    notice: z.string().optional().describe('Disclosure when the filmography was capped.'),
  },
  errors: [
    {
      reason: 'person_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given person id.',
      recovery: 'Verify the id with tmdb_search_titles (mode "person").',
    },
  ],

  async handler(input, ctx) {
    const person = await getTmdbService().getPerson(input.person_id, ctx, input.language);

    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    ctx.enrich.total(person.cast_credits_total + person.crew_credits_total);

    const castCapped = person.cast_credits_total > person.cast_credits.length;
    const crewCapped = person.crew_credits_total > person.crew_credits.length;
    if (castCapped || crewCapped) {
      ctx.enrich.truncated({
        shown: person.cast_credits.length + person.crew_credits.length,
        cap: 50,
        guidance: `Filmography capped to the most recent 50 per list (cast ${person.cast_credits_total}, crew ${person.crew_credits_total} total). Older credits are omitted.`,
      });
    }

    return person;
  },

  format: (p) => {
    const lines = [`# ${p.name}`];
    const facts = [`**id:** ${p.id}`, `**popularity:** ${p.popularity.toFixed(1)}`];
    if (p.known_for_department) facts.push(`**known for:** ${p.known_for_department}`);
    if (p.gender) facts.push(`**gender:** ${p.gender}`);
    if (p.birthday) facts.push(`**born:** ${p.birthday}`);
    if (p.deathday) facts.push(`**died:** ${p.deathday}`);
    if (p.place_of_birth) facts.push(`**birthplace:** ${p.place_of_birth}`);
    if (p.imdb_id) facts.push(`**imdb:** ${p.imdb_id}`);
    lines.push(facts.join(' | '));
    if (p.homepage) lines.push(`**homepage:** ${p.homepage}`);
    if (p.also_known_as?.length) lines.push(`**also known as:** ${p.also_known_as.join(', ')}`);
    if (p.profile_url) lines.push(`![profile](${p.profile_url})`);
    if (p.biography) lines.push(`\n${p.biography}`);
    if (p.external_ids)
      lines.push(
        `\n**External ids:** ${Object.entries(p.external_ids)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      );

    lines.push(`\n**Cast credits** (${p.cast_credits.length} of ${p.cast_credits_total}):`);
    for (const c of p.cast_credits) {
      const yr = c.release_year ? ` (${c.release_year})` : '';
      const rating = c.vote_average !== undefined ? ` ★${c.vote_average.toFixed(1)}` : '';
      const poster = c.poster_url ? ` ${c.poster_url}` : '';
      lines.push(
        `- ${c.title}${yr} [${c.media_type}, id ${c.id}]${c.character ? ` as ${c.character}` : ''}${rating}${poster}`,
      );
    }

    lines.push(`\n**Crew credits** (${p.crew_credits.length} of ${p.crew_credits_total}):`);
    for (const c of p.crew_credits) {
      const yr = c.release_year ? ` (${c.release_year})` : '';
      const dept = c.department ? `, ${c.department}` : '';
      const poster = c.poster_url ? ` ${c.poster_url}` : '';
      lines.push(`- ${c.title}${yr} [${c.media_type}, id ${c.id}] — ${c.job}${dept}${poster}`);
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
