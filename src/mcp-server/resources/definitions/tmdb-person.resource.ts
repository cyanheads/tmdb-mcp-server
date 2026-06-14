/**
 * @fileoverview tmdb://person/{person_id} — person detail by id as injectable context.
 * Resolves through the same service method as tmdb_get_person (combined_credits + external_ids).
 * @module mcp-server/resources/definitions/tmdb-person.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTmdbService } from '@/services/tmdb/tmdb-service.js';

export const tmdbPersonResource = resource('tmdb://person/{person_id}', {
  name: 'tmdb-person',
  title: 'TMDB person detail',
  description:
    'Person detail and full filmography by TMDB person id, as injectable context for chat about a specific person. Same enriched record as tmdb_get_person.',
  mimeType: 'application/json',
  params: z.object({
    person_id: z
      .string()
      .regex(/^\d+$/)
      .describe('TMDB person id (integer). Obtain it from tmdb_search_titles (mode "person").'),
  }),
  errors: [
    {
      reason: 'person_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'TMDB returns 404 for the given person id.',
      recovery: 'Verify the id with tmdb_search_titles (mode "person").',
    },
  ],

  handler(params, ctx) {
    return getTmdbService().getPerson(Number.parseInt(params.person_id, 10), ctx);
  },
});
