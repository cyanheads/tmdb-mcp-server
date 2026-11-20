/**
 * @fileoverview tmdb://movie/{movie_id} — movie detail by id as injectable context.
 * Resolves through tmdb_get_movie's service with default appends and first-page credits.
 * @module mcp-server/resources/definitions/tmdb-movie.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService, type MovieAppend } from '@/services/tmdb/tmdb-service.js';

const DEFAULT_APPEND: MovieAppend[] = [
  'credits',
  'videos',
  'recommendations',
  'similar',
  'keywords',
  'external_ids',
  'release_dates',
];

export const tmdbMovieResource = resource('tmdb://movie/{movie_id}', {
  name: 'tmdb-movie',
  title: 'TMDB movie detail',
  description:
    'Movie detail by TMDB id, with collection metadata when available and the first 15 cast and 50 crew credits with full totals. Use tmdb_get_movie credits_page for more credits or append "collection" there for collection movies.',
  mimeType: 'application/json',
  params: z.object({
    movie_id: z
      .string()
      .regex(/^\d+$/)
      .describe(
        'TMDB movie id (integer). Obtain it from tmdb_search_titles or tmdb_discover_titles.',
      ),
  }),
  errors: [
    {
      reason: 'movie_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given movie id.',
      recovery:
        'Verify the id with tmdb_search_titles (mode "movie") — TMDB keys on integer ids, not titles.',
      thrownBy: 'service',
    },
  ],

  handler(params, ctx) {
    return getTmdbService().getMovie(Number.parseInt(params.movie_id, 10), DEFAULT_APPEND, ctx);
  },
});
