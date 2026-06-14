/**
 * @fileoverview Shared Zod sub-schemas, the TMDB attribution constant, and the
 * common enrichment block reused across the tmdb-mcp-server tool definitions.
 * Keeping the summary-card / cast / crew / provider shapes here avoids
 * re-declaring them in every list and detail tool.
 * @module mcp-server/tools/definitions/_shared
 */

import { z } from '@cyanheads/mcp-ts-core';

/** Mandatory TMDB attribution string, surfaced in every tool's enrichment. */
export const TMDB_ATTRIBUTION =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.';

export const MediaTypeSchema = z
  .enum(['movie', 'tv', 'person'])
  .describe('Entity kind — pass to the matching detail tool (movie→tmdb_get_movie, etc.).');

/** A ranked summary card — search / discover / trending / recommendations / similar. */
export const SummaryItemSchema = z
  .object({
    id: z
      .number()
      .describe(
        'TMDB id. Pass to tmdb_get_movie / tmdb_get_show / tmdb_get_person per media_type.',
      ),
    media_type: MediaTypeSchema,
    title: z.string().describe('Display title (movie/tv) or person name.'),
    release_year: z
      .number()
      .optional()
      .describe('Release year (movie) or first-air year (tv). Omitted when unknown.'),
    overview: z
      .string()
      .optional()
      .describe('Synopsis / bio snippet. Omitted when absent upstream.'),
    vote_average: z.number().optional().describe('Average rating, 0–10. Omitted when absent.'),
    vote_count: z.number().optional().describe('Number of votes. Omitted when absent.'),
    popularity: z.number().optional().describe('TMDB popularity score. Omitted when absent.'),
    genre_names: z
      .array(z.string())
      .optional()
      .describe('Genre names resolved from genre ids (movie/tv only).'),
    poster_url: z
      .string()
      .optional()
      .describe('Full poster image URL (movie/tv). Omitted when none.'),
    profile_url: z
      .string()
      .optional()
      .describe('Full profile image URL (person). Omitted when none.'),
    known_for_department: z
      .string()
      .optional()
      .describe('Primary department for a person (e.g. "Acting"). Omitted for non-person items.'),
    known_for: z
      .array(
        z
          .object({
            id: z.number().describe('TMDB id of the known-for title.'),
            media_type: MediaTypeSchema,
            title: z.string().describe('Title of the known-for movie/tv.'),
            poster_url: z.string().optional().describe('Full poster URL. Omitted when none.'),
          })
          .describe('A movie/tv title the person is known for.'),
      )
      .optional()
      .describe(
        'For people: a few movie/tv titles they are known for (media records, not people).',
      ),
  })
  .describe('A ranked summary result.');

export const GenreSchema = z
  .object({
    id: z.number().describe('Genre id (namespace differs between movie and tv).'),
    name: z.string().describe('Genre name.'),
  })
  .describe('A genre or keyword tag.');

export const CastMemberSchema = z
  .object({
    id: z.number().describe('TMDB person id. Pass to tmdb_get_person.'),
    name: z.string().describe('Actor name.'),
    character: z.string().optional().describe('Character played. Omitted when absent.'),
    order: z
      .number()
      .optional()
      .describe('Billing order (lower = top-billed). Omitted when absent.'),
    profile_url: z.string().optional().describe('Full profile image URL. Omitted when none.'),
  })
  .describe('A cast member.');

export const CrewMemberSchema = z
  .object({
    id: z.number().describe('TMDB person id. Pass to tmdb_get_person.'),
    name: z.string().describe('Crew member name.'),
    job: z.string().describe('Job (e.g. "Director", "Writer").'),
    department: z.string().optional().describe('Department. Omitted when absent.'),
    profile_url: z.string().optional().describe('Full profile image URL. Omitted when none.'),
  })
  .describe('A key crew member (Director/Writer/Screenplay/Story/Producer/Creator).');

export const TrailerSchema = z
  .object({
    name: z.string().describe('Video title.'),
    key: z.string().describe('YouTube video key.'),
    url: z.string().describe('Full YouTube watch URL.'),
    type: z.string().optional().describe('Video type (Trailer/Teaser). Omitted when absent.'),
    site: z.string().describe('Hosting site (always "YouTube").'),
  })
  .describe('A YouTube trailer or teaser.');

export const ProviderSchema = z
  .object({
    provider_id: z
      .number()
      .describe('TMDB/JustWatch provider id — pass to tmdb_discover_titles with_watch_providers.'),
    provider_name: z.string().describe('Display name, e.g. "Netflix".'),
    logo_url: z.string().optional().describe('Full provider logo URL. Omitted when none.'),
    display_priority: z
      .number()
      .describe('TMDB-suggested ordering within the region (lower = higher priority).'),
  })
  .describe('A streaming/rental/purchase provider.');

/* ─────────────────────────── Shared renderers ──────────────────────────── */
/**
 * Complete markdown renderers for the reused sub-schemas. Every field a schema
 * declares is rendered here so `format-parity` holds wherever the schema is used.
 * Keep these exhaustive — adding a field to a schema means adding it here.
 */

type SummaryItem = z.infer<typeof SummaryItemSchema>;
type CastMember = z.infer<typeof CastMemberSchema>;
type CrewMember = z.infer<typeof CrewMemberSchema>;
type Trailer = z.infer<typeof TrailerSchema>;
type Provider = z.infer<typeof ProviderSchema>;
type Genre = z.infer<typeof GenreSchema>;

/** One-line rendering of a summary card with every field present. */
export function renderSummaryItem(r: SummaryItem): string {
  const facts = [`id ${r.id}`, r.media_type];
  if (r.release_year !== undefined) facts.push(`year ${r.release_year}`);
  if (r.vote_average !== undefined) facts.push(`rating ${r.vote_average.toFixed(1)}`);
  if (r.vote_count !== undefined) facts.push(`${r.vote_count} votes`);
  if (r.popularity !== undefined) facts.push(`pop ${r.popularity.toFixed(1)}`);
  if (r.genre_names?.length) facts.push(`genres ${r.genre_names.join('/')}`);
  if (r.known_for_department) facts.push(`dept ${r.known_for_department}`);
  let line = `${r.title} (${facts.join(', ')})`;
  if (r.poster_url) line += ` poster ${r.poster_url}`;
  if (r.profile_url) line += ` profile ${r.profile_url}`;
  if (r.overview) line += ` — ${r.overview}`;
  if (r.known_for?.length) {
    line += ` [known for: ${r.known_for
      .map(
        (k) =>
          `${k.title} (id ${k.id}, ${k.media_type}${k.poster_url ? `, poster ${k.poster_url}` : ''})`,
      )
      .join('; ')}]`;
  }
  return line;
}

/** Bulleted list of summary cards (each fully rendered), or `_none_` when empty. */
export function renderSummaryList(label: string, items: SummaryItem[] | undefined): string[] {
  if (!items?.length) return [];
  return [`\n**${label}:**`, ...items.map((r) => `- ${renderSummaryItem(r)}`)];
}

/** Complete cast-member rendering. */
export function renderCast(c: CastMember): string {
  const parts = [`${c.name} (id ${c.id}`];
  if (c.order !== undefined) parts.push(`, order ${c.order}`);
  parts.push(')');
  let line = parts.join('');
  if (c.character) line += ` as ${c.character}`;
  if (c.profile_url) line += ` — profile ${c.profile_url}`;
  return line;
}

/** Complete crew-member rendering. */
export function renderCrew(c: CrewMember): string {
  let line = `${c.name} — ${c.job} (id ${c.id})`;
  if (c.department) line += ` [${c.department}]`;
  if (c.profile_url) line += ` — profile ${c.profile_url}`;
  return line;
}

/** Complete trailer rendering. */
export function renderTrailer(t: Trailer): string {
  return `[${t.name}](${t.url}) — ${t.site}${t.type ? `, ${t.type}` : ''}, key ${t.key}`;
}

/** Complete provider rendering. */
export function renderProvider(p: Provider): string {
  let line = `${p.provider_name} (id ${p.provider_id}, priority ${p.display_priority})`;
  if (p.logo_url) line += ` — logo ${p.logo_url}`;
  return line;
}

/** Renders genre/keyword tags as `name (id)` — covers both `name` and `id`. */
export function renderGenres(genres: Genre[]): string {
  return genres.map((g) => `${g.name} (${g.id})`).join(', ');
}

/** Shared enrichment fields for the three list tools (search/discover/trending). */
export const listEnrichment = {
  attribution: z.string().describe(TMDB_ATTRIBUTION),
  totalCount: z.number().describe('Total matching results across all pages (before pagination).'),
  notice: z
    .string()
    .optional()
    .describe('Recovery guidance when results are empty, or region/filter caveats.'),
} as const;

/** Shared enrichment fields for the detail tools (movie/show/season/person/watch). */
export const detailEnrichment = {
  attribution: z.string().describe(TMDB_ATTRIBUTION),
  notice: z.string().optional().describe('Region caveats or other agent-facing context.'),
} as const;
