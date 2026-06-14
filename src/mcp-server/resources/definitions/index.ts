/**
 * @fileoverview Barrel of all tmdb-mcp-server resource definitions for createApp().
 * @module mcp-server/resources/definitions/index
 */

import { tmdbMovieResource } from './tmdb-movie.resource.js';
import { tmdbPersonResource } from './tmdb-person.resource.js';
import { tmdbTvResource } from './tmdb-tv.resource.js';

export const allResourceDefinitions = [tmdbMovieResource, tmdbTvResource, tmdbPersonResource];
