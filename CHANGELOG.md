# Changelog

All notable changes to this project. Each entry links to its full per-version file in [changelog/](changelog/).

## [0.1.4](changelog/0.1.x/0.1.4.md) — 2026-10-07

Input repair and request IDs on errors, with updated Docker and registry packaging.

## [0.1.3](changelog/0.1.x/0.1.3.md) — 2026-09-20 · ⚠️ Breaking

MCP_SESSION_MODE now resolves stateless on every run path — bunx, npm start, from source — matching the container's long-standing default instead of auto's stateful fallback (#3). Framework bumps to mcp-ts-core ^0.13.6, and both plugin manifests deliver TMDB_API_KEY through user_config instead of an unresolved raw env passthrough.

## [0.1.2](changelog/0.1.x/0.1.2.md) — 2026-08-21

Adopts @cyanheads/mcp-ts-core ^0.12.3 (MCP SDK v2): protocol 2026-07-28 beside 2025-era clients, strict tool inputs, declared error envelope; region_required maps to ValidationError; supply-chain install guard; Bun 1.4 Docker images.

## [0.1.1](changelog/0.1.x/0.1.1.md) — 2026-06-14

Action-first metadata — package, README, manifest, server.json, and plugin descriptions rewritten to lead with the capability and name the transports (STDIO or Streamable HTTP).

## [0.1.0](changelog/0.1.x/0.1.0.md) — 2026-06-13

Initial release — TMDB film/TV/person catalog: 8 tools (search, movie/show/season/person detail, discover, trending, watch providers) + 3 resources, with image-URL resolution, genre-name maps, and region-aware streaming availability.
