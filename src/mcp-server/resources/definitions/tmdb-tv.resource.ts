/**
 * @fileoverview tmdb://tv/{series_id} — show detail by id as injectable context.
 * Resolves through tmdb_get_show's service with default appends and first-page credits.
 * @module mcp-server/resources/definitions/tmdb-tv.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService, type ShowAppend } from '@/services/tmdb/tmdb-service.js';

const DEFAULT_APPEND: ShowAppend[] = [
  'credits',
  'videos',
  'recommendations',
  'similar',
  'keywords',
  'external_ids',
  'content_ratings',
];

export const tmdbTvResource = resource('tmdb://tv/{series_id}', {
  name: 'tmdb-tv',
  title: 'TMDB show detail',
  description:
    'TV show detail by TMDB series id, with the first 15 series-wide cast and 50 crew credits, grouped roles and jobs, episode counts, and full totals. Use tmdb_get_show credits_page to retrieve later credits.',
  mimeType: 'application/json',
  params: z.object({
    series_id: z
      .string()
      .regex(/^\d+$/)
      .describe(
        'TMDB TV series id (integer). Obtain it from tmdb_search_titles or tmdb_discover_titles.',
      ),
  }),
  errors: [
    {
      reason: 'show_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given series id.',
      recovery:
        'Verify the id with tmdb_search_titles (mode "tv") — TMDB keys on integer ids, not titles.',
      thrownBy: 'service',
    },
  ],

  handler(params, ctx) {
    return getTmdbService().getShow(Number.parseInt(params.series_id, 10), DEFAULT_APPEND, ctx);
  },
});
