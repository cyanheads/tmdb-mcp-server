#!/usr/bin/env node
/**
 * @fileoverview tmdb-mcp-server MCP server entry point. Wires the TMDB tool and
 * resource surface, then in setup() constructs the TmdbService and primes its
 * startup cache (/configuration + genre maps) — failure there aborts startup loudly.
 * @module index
 */

import { createApp } from '@cyanheads/mcp-ts-core';
import { requestContextService } from '@cyanheads/mcp-ts-core/utils';
import { allResourceDefinitions } from './mcp-server/resources/definitions/index.js';
import { allToolDefinitions } from './mcp-server/tools/definitions/index.js';
import { initTmdbService } from './services/tmdb/tmdb-service.js';

const INSTRUCTIONS =
  'Use the tmdb_* tools for film/TV/person data via TMDB. TMDB keys on integer ids — start with ' +
  'tmdb_search_titles to resolve a name to an id, then tmdb_get_movie / tmdb_get_show / tmdb_get_person. ' +
  'tmdb_discover_titles is the power-query for filtered browsing (genre, year, rating, sort); ' +
  'tmdb_get_trending for what is hot. Streaming availability (tmdb_get_watch_providers) is region-specific — ' +
  'pass a country code; results never imply global availability. Image fields are returned as full URLs. ' +
  'This product uses the TMDB API but is not endorsed or certified by TMDB.';

await createApp({
  name: 'tmdb-mcp-server',
  title: 'tmdb-mcp-server',
  instructions: INSTRUCTIONS,
  tools: allToolDefinitions,
  resources: allResourceDefinitions,
  async setup() {
    const service = initTmdbService();
    const ctx = requestContextService.createRequestContext({ operation: 'tmdb.startup-cache' });
    await service.init(ctx);
  },
});
