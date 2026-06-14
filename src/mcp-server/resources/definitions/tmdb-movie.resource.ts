/**
 * @fileoverview tmdb://movie/{movie_id} — movie detail by id as injectable context.
 * Resolves through the same service method as tmdb_get_movie with the full append set.
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
    'Full movie detail by TMDB id, as injectable context for chat about a specific film. Same enriched record as tmdb_get_movie (all sub-resources appended).',
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
    },
  ],

  handler(params, ctx) {
    return getTmdbService().getMovie(Number.parseInt(params.movie_id, 10), DEFAULT_APPEND, ctx);
  },
});
