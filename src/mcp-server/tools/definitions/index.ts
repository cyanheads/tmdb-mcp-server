/**
 * @fileoverview Barrel of all tmdb-mcp-server tool definitions for createApp().
 * @module mcp-server/tools/definitions/index
 */

import { tmdbDiscoverTitles } from './tmdb-discover-titles.tool.js';
import { tmdbGetMovie } from './tmdb-get-movie.tool.js';
import { tmdbGetPerson } from './tmdb-get-person.tool.js';
import { tmdbGetSeason } from './tmdb-get-season.tool.js';
import { tmdbGetShow } from './tmdb-get-show.tool.js';
import { tmdbGetTrending } from './tmdb-get-trending.tool.js';
import { tmdbGetWatchProviders } from './tmdb-get-watch-providers.tool.js';
import { tmdbSearchTitles } from './tmdb-search-titles.tool.js';

export const allToolDefinitions = [
  tmdbSearchTitles,
  tmdbGetMovie,
  tmdbGetShow,
  tmdbGetSeason,
  tmdbGetPerson,
  tmdbDiscoverTitles,
  tmdbGetTrending,
  tmdbGetWatchProviders,
];
