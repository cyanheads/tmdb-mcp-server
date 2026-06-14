/**
 * @fileoverview Test helpers for tmdb-mcp-server. Provides a URL-routed mock of the
 * framework's `fetchWithTimeout` (which THROWS an McpError on non-OK, mirroring the
 * real helper), plus canned TMDB response fixtures and a service-init helper.
 * @module tests/helpers/mock-tmdb
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { vi } from 'vitest';

/**
 * A route table: substring of the request path → JSON body to return. The first
 * matching key wins. `__configuration__`, `__movie_genres__`, `__tv_genres__` are
 * special startup-cache keys consumed by the mock router.
 */
export type Routes = Record<string, unknown>;

/** Builds a `Response`-like object whose `.text()` resolves the JSON body. */
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async text() {
      return JSON.stringify(body);
    },
  } as Response;
}

/**
 * Installs a `vi.mock` of `@cyanheads/mcp-ts-core/utils` whose `fetchWithTimeout`
 * routes by URL substring against `getRoutes()` (read lazily so tests can mutate it).
 * Non-OK is modeled by throwing an McpError with the given code — exactly what the
 * real `fetchWithTimeout` does (it never resolves a non-OK Response).
 *
 * Call this at module top level (vi.mock is hoisted); the factory reads the live
 * `routeState` object so per-test `setRoutes()` works.
 */
export const routeState: {
  routes: Routes;
  throwMatch?: { match: string; code: JsonRpcErrorCode };
} = { routes: {} };

export function setRoutes(routes: Routes): void {
  routeState.routes = routes;
  delete routeState.throwMatch;
}

/** Configures the mock to throw `code` for any request path containing `match`. */
export function throwForPath(match: string, code: JsonRpcErrorCode): void {
  routeState.throwMatch = { match, code };
}

/**
 * The mock `fetchWithTimeout`. Exported so the vi.mock factory in each test file can
 * reference it. Throws on a routed error; otherwise returns the first matching body.
 */
export async function mockFetchWithTimeout(url: string | URL): Promise<Response> {
  const path = typeof url === 'string' ? url : url.toString();

  if (routeState.throwMatch && path.includes(routeState.throwMatch.match)) {
    throw new McpError(routeState.throwMatch.code, `Mock HTTP error for ${path}`, {
      statusCode: routeState.throwMatch.code === JsonRpcErrorCode.NotFound ? 404 : 500,
    });
  }

  for (const [key, body] of Object.entries(routeState.routes)) {
    if (path.includes(key)) return jsonResponse(body);
  }

  throw new McpError(JsonRpcErrorCode.NotFound, `No mock route for ${path}`, { statusCode: 404 });
}

/* ──────────────────────────── Startup-cache fixtures ────────────────────── */

export const CONFIGURATION_FIXTURE = {
  images: {
    base_url: 'http://image.tmdb.org/t/p/',
    secure_base_url: 'https://image.tmdb.org/t/p/',
    poster_sizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
    backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
    profile_sizes: ['w45', 'w185', 'h632', 'original'],
    still_sizes: ['w92', 'w185', 'w300', 'original'],
    logo_sizes: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
  },
};

export const MOVIE_GENRES_FIXTURE = {
  genres: [
    { id: 28, name: 'Action' },
    { id: 18, name: 'Drama' },
    { id: 35, name: 'Comedy' },
    { id: 53, name: 'Thriller' },
    { id: 878, name: 'Science Fiction' },
  ],
};

export const TV_GENRES_FIXTURE = {
  genres: [
    { id: 18, name: 'Drama' },
    { id: 80, name: 'Crime' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
  ],
};

/** The three startup-cache routes every service-using test needs. */
export const STARTUP_ROUTES: Routes = {
  '/configuration': CONFIGURATION_FIXTURE,
  '/genre/movie/list': MOVIE_GENRES_FIXTURE,
  '/genre/tv/list': TV_GENRES_FIXTURE,
};

/** Sets the route table to the startup-cache fixtures plus any extra routes. */
export function withStartupRoutes(extra: Routes): Routes {
  return { ...STARTUP_ROUTES, ...extra };
}

/**
 * Initializes the TmdbService singleton (via the production init path) with the
 * startup cache primed, so tool handlers calling `getTmdbService()` work. Stubs
 * `TMDB_API_KEY` so config parses, then calls `initTmdbService()` + `init()`.
 * Must be called after the `vi.mock` of `@cyanheads/mcp-ts-core/utils` is installed.
 */
export async function initServiceForTools(extra: Routes = {}): Promise<void> {
  setRoutes(withStartupRoutes(extra));
  vi.stubEnv('TMDB_API_KEY', 'test-bearer-token');
  const { initTmdbService, resetTmdbService } = await import('@/services/tmdb/tmdb-service.js');
  const { resetServerConfig } = await import('@/config/server-config.js');
  resetTmdbService();
  resetServerConfig();
  const svc = initTmdbService();
  await svc.init(createMockContext());
}
