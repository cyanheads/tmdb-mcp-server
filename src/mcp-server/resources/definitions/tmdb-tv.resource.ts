/**
 * @fileoverview tmdb://tv/{series_id} — show detail by id as injectable context.
 * Resolves through the same service method as tmdb_get_show with the full append set.
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
    'Full TV show detail by TMDB series id, as injectable context for chat about a specific series. Same enriched record as tmdb_get_show (all sub-resources appended).',
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
    },
  ],

  handler(params, ctx) {
    return getTmdbService().getShow(Number.parseInt(params.series_id, 10), DEFAULT_APPEND, ctx);
  },
});
