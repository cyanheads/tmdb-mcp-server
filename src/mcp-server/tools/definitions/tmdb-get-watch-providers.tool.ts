/**
 * @fileoverview tmdb_get_watch_providers — region-scoped streaming availability
 * (JustWatch-backed). Availability is region-specific; a region code is required and
 * results never imply global availability.
 * @module mcp-server/tools/definitions/tmdb-get-watch-providers.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { escapeMarkdownInline, markdownLink } from '@cyanheads/mcp-ts-core/utils';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';
import {
  detailEnrichment,
  noticeTrailer,
  ProviderSchema,
  renderProvider,
  TMDB_ATTRIBUTION,
} from './_shared.js';

export const tmdbGetWatchProviders = tool('tmdb_get_watch_providers', {
  title: 'tmdb-mcp-server: get watch providers',
  description:
    'Find where a movie or TV title streams in one region. Returns the resolved title and year, provider lists (subscription, rent, buy, ad-supported, and free), and the TMDB JustWatch-backed link for the requested region. A region code is required. Empty provider lists mean TMDB has no provider entries for the requested region. Use the reported region codes to choose another region to query separately.',
  annotations: { readOnlyHint: true, openWorldHint: true },
  input: z.object({
    media_type: z.enum(['movie', 'tv']).describe('Whether the id is a movie or a TV show.'),
    id: z
      .number()
      .int()
      .positive()
      .describe(
        'TMDB movie or TV id (matching media_type), from tmdb_search_titles or tmdb_discover_titles.',
      ),
    watch_region: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .describe(
        'ISO 3166-1 alpha-2 country code, uppercase (e.g. "US", "GB", "DE"). REQUIRED — streaming availability is region-specific (JustWatch); there is no global answer.',
      ),
  }),
  output: z.object({
    id: z.number().describe('The title id queried.'),
    media_type: z.enum(['movie', 'tv']).describe('Movie or TV.'),
    title: z
      .string()
      .optional()
      .describe('Resolved title in the configured language, when supplied.'),
    release_year: z
      .number()
      .optional()
      .describe('Movie release year or TV premiere year, when known.'),
    region: z.string().describe('The ISO 3166-1 region the availability applies to.'),
    available_regions: z
      .array(z.string())
      .describe('Sorted region codes with TMDB provider data. Each region is queried separately.'),
    link: z
      .string()
      .optional()
      .describe(
        'TMDB JustWatch-backed page for this title/region — the supported way to reach actual deep links. Absent when TMDB has no provider data for the region.',
      ),
    flatrate: z
      .array(ProviderSchema)
      .describe('Subscription/streaming-included providers. Empty when none.'),
    rent: z.array(ProviderSchema).describe('Rental providers. Empty when none.'),
    buy: z.array(ProviderSchema).describe('Purchase providers. Empty when none.'),
    ads: z.array(ProviderSchema).describe('Ad-supported free providers. Empty when none.'),
    free: z.array(ProviderSchema).describe('Free providers. Empty when none.'),
  }),
  enrichment: detailEnrichment,
  enrichmentTrailer: noticeTrailer,
  errors: [
    {
      reason: 'title_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given id + media_type.',
      recovery:
        'Verify the id and that media_type matches it (a movie id is not a tv id) via tmdb_search_titles.',
      thrownBy: 'service',
    },
  ],

  async handler(input, ctx) {
    const result = await getTmdbService().getWatchProviders(
      input.media_type,
      input.id,
      input.watch_region,
      ctx,
    );

    const total =
      result.flatrate.length +
      result.rent.length +
      result.buy.length +
      result.ads.length +
      result.free.length;

    ctx.enrich({ attribution: TMDB_ATTRIBUTION });
    if (total === 0) {
      ctx.enrich.notice(
        `No providers found for region ${input.watch_region}. This title may not be available to stream/rent/buy there. Availability is region-specific (JustWatch).${result.available_regions.some((region) => region !== input.watch_region) ? ' To check availability elsewhere, query a listed region separately.' : ''}`,
      );
    } else {
      ctx.enrich.notice(
        `Availability shown for region ${input.watch_region} only (JustWatch). Other regions differ; query each region separately.`,
      );
    }

    return result;
  },

  format: (r) => {
    const lines = [`# Watch providers — ${r.media_type} ${r.id} (region ${r.region})`];
    if (r.title) {
      lines.push(
        `${escapeMarkdownInline(r.title)}${r.release_year !== undefined ? ` (${r.release_year})` : ''}`,
      );
    } else if (r.release_year !== undefined) {
      lines.push(`**Release year:** ${r.release_year}`);
    }
    if (r.link) lines.push(markdownLink('Watch options', r.link));
    lines.push(
      `**Regions with provider data:** ${r.available_regions.length ? r.available_regions.map(escapeMarkdownInline).join(', ') : 'None'}`,
    );
    const section = (label: string, providers: typeof r.flatrate) => {
      if (!providers.length) return;
      lines.push(`\n**${label}:**`);
      for (const p of providers) {
        lines.push(`- ${renderProvider(p)}`);
      }
    };
    section('Stream (flatrate)', r.flatrate);
    section('Rent', r.rent);
    section('Buy', r.buy);
    section('Free (ad-supported)', r.ads);
    section('Free', r.free);
    if (!r.flatrate.length && !r.rent.length && !r.buy.length && !r.ads.length && !r.free.length) {
      lines.push('\n_No providers in this region._');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
