<div align="center">
  <h1>@cyanheads/tmdb-mcp-server</h1>
  <p><b>Search movies, TV, and people on The Movie Database (TMDB) — credits, ratings, trailers, images, recommendations, and region-aware streaming availability via MCP. STDIO or Streamable HTTP.</b>
  <div>8 Tools • 3 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.1-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/tmdb-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.29.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/tmdb-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/tmdb-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^6.0.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.3.2-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/tmdb-mcp-server/releases/latest/download/tmdb-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tmdb-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvdG1kYi1tY3Atc2VydmVyIl0sImVudiI6eyJUTURCX0FQSV9LRVkiOiJ5b3VyLXRtZGItcmVhZC1hY2Nlc3MtdG9rZW4ifX0=) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22tmdb-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Ftmdb-mcp-server%22%5D%2C%22env%22%3A%7B%22TMDB_API_KEY%22%3A%22your-tmdb-read-access-token%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

---

## Tools

Eight tools organized search-before-detail — `tmdb_search_titles` resolves a name to an integer id, the `get_*` tools fetch full records, and `tmdb_discover_titles` / `tmdb_get_trending` / `tmdb_get_watch_providers` cover filtered browsing and streaming availability. TMDB keys on integer ids, not titles, so search comes first.

| Tool | Description |
|:---|:---|
| `tmdb_search_titles` | Search movies, TV, and people by name. The required first step — resolves a name to the integer id the detail tools consume. |
| `tmdb_get_movie` | Full movie detail in one call — synopsis, runtime, genres, US certification, budget/revenue, cast, crew, trailers, recommendations, keywords, external ids. |
| `tmdb_get_show` | Full TV show detail — overview, air dates, status, season/episode counts, creators, networks, season summaries, cast, trailers, content rating. |
| `tmdb_get_season` | Episode list for one season — names, air dates, runtimes, vote averages, stills, per-episode guest stars, plus the season's regular cast. |
| `tmdb_get_person` | Person detail and full filmography — biography, vital dates, the `combined_credits` cast/crew lists, and cross-platform external ids. |
| `tmdb_discover_titles` | Filtered, sorted discovery across movies or TV — the power-query: genre, date/vote ranges, vote-count floor, cast/crew/network, watch providers, runtime, sort. |
| `tmdb_get_trending` | Trending movies, TV, or people for the day or week. |
| `tmdb_get_watch_providers` | Region-scoped streaming availability (JustWatch) — flatrate/rent/buy/ads/free provider lists plus the TMDB link. A region code is required. |

All list and detail responses resolve image `*_path` fields to full `https://image.tmdb.org/t/p/…` URLs and resolve `genre_ids[]` to genre names. Every tool carries the TMDB attribution in its output enrichment.

### `tmdb_search_titles`

Resolve a movie, show, or person name to ranked results with integer ids.

- `multi` mode (default) mixes movies, shows, and people, each result tagged with `media_type`; `movie`/`tv`/`person` restrict to one type and enable type-specific ranking
- Optional `year` filter (movie/tv modes), `language` override, `include_adult` toggle, and `page` for paging past the first 20
- Each result carries `id`, `media_type`, title/name, `release_year`, `overview`, `vote_average`, resolved `genre_names`, and the relevant poster/profile URL
- An empty result set is a valid answer, returned with recovery guidance — not an error

---

### `tmdb_get_movie`

Fetch full movie detail by TMDB id in a single request.

- Folds credits, videos, recommendations, similar, keywords, external ids, and release dates into one call via `append_to_response` — trim the `append` array to shrink the payload (e.g. `["credits"]` for cast only)
- US theatrical certification extracted from the `release_dates` namespace; top-billed cast and key crew (Director/Writer/Screenplay/Producer); YouTube trailers with watch URLs
- Does not include streaming availability — that is region-specific; use `tmdb_get_watch_providers`

---

### `tmdb_get_show`

Fetch full TV show detail by series id — the series mirror of `tmdb_get_movie`.

- Same `append_to_response` set, with `content_ratings` (US TV rating) in place of `release_dates`
- Adds season summaries, creators, networks, and the last/next episode to air
- Pass a `season_number` from `seasons[]` to `tmdb_get_season` for the episode list

---

### `tmdb_get_season`

Fetch the episode list for one season of a show — bridges the show-level summary and per-episode detail.

- Per-episode names, air dates, runtimes, vote averages, still URLs, and guest stars (embedded per episode)
- Plus the season's regular recurring cast (distinct from per-episode guest stars)
- `series_id` is echoed from the input — the TMDB season endpoint does not return it. Season 0 is "Specials"

---

### `tmdb_get_person`

Fetch person detail and the full combined filmography.

- Biography, birth/death dates, place of birth, known-for department, aliases, gender label
- `combined_credits` split into `cast_credits` and `crew_credits`, recency-ordered (most recent first) and capped to a display size — the pre-cap totals are reported and truncation is disclosed in the enrichment
- IMDb id plus the extended cross-platform id set (Wikidata, social handles) for chaining to other servers

---

### `tmdb_discover_titles`

The power-query — filtered, sorted discovery across movies or TV.

- Filter by `with_genres`/`without_genres`, exact `year` or a `release_date_gte`/`lte` window, `vote_average` range, `vote_count_gte` floor, `with_cast`/`with_crew` (movie), `with_networks` (tv), `with_watch_providers` + `watch_region`, `with_original_language`, and `runtime` range
- Sort by popularity, revenue, vote average, vote count, or release date. Pair `vote_average.desc` with `vote_count_gte` (~100–1000) so a 10.0-from-3-votes title does not dominate
- `with_cast`/`with_crew` are movie-only and `with_networks` is tv-only on TMDB; the tool accepts them for both `media_type` values and no-ops the inapplicable ones with a notice
- `with_watch_providers` requires a `watch_region` — streaming availability is region-specific. Omitting the region returns a typed `region_required` error

---

### `tmdb_get_watch_providers`

Find where a movie or TV title streams in one region.

- Returns flatrate (subscription), rent, buy, ads (ad-supported free), and free provider lists with logo URLs, plus the TMDB JustWatch-backed `link` — the supported path to actual deep links
- A `watch_region` (ISO 3166-1 alpha-2) is required: availability is region-specific and there is no global answer; the response always carries a region caveat
- An empty result for a region is a valid "not available to stream here" answer, not an error
- Provider ids in the result feed back into `tmdb_discover_titles` `with_watch_providers`

## Resources

| Type | Name | Description |
|:---|:---|:---|
| Resource | `tmdb://movie/{movie_id}` | Movie detail by id, as injectable context — the same enriched record as `tmdb_get_movie`. |
| Resource | `tmdb://tv/{series_id}` | Show detail by id — the same enriched record as `tmdb_get_show`. |
| Resource | `tmdb://person/{person_id}` | Person detail and filmography by id — the same record as `tmdb_get_person`. |

All resource data is also reachable via tools — the three resources are convenience wrappers over the detail service methods, so tool-only clients lose nothing. Search, discovery, trending, and seasons are query paths or intermediate records, not addressable entities, so they have no resources. There are no prompts: this is a data/lookup server with no recurring multi-step interaction template.

## Features

Built on [`@cyanheads/mcp-ts-core`](https://www.npmjs.com/package/@cyanheads/mcp-ts-core):

- Declarative tool and resource definitions — single file per primitive, framework handles registration and validation
- Unified error handling — handlers throw, framework catches, classifies, and formats
- Typed error contracts — every tool declares its failure reasons with recovery guidance for the agent
- Pluggable auth: `none`, `jwt`, `oauth`
- Swappable storage backends: `in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`
- Structured logging with optional OpenTelemetry tracing
- STDIO and Streamable HTTP transports — runs locally or on Cloudflare Workers from the same codebase

TMDB-specific:

- Single typed client for the TMDB v3 REST API, authenticated with a v4 Read Access Token over `Authorization: Bearer`
- Image `*_path` fields resolved to full `https://image.tmdb.org/t/p/{size}{path}` URLs — null paths omit the field rather than emitting a broken URL
- `genre_ids[]` resolved to genre names from per-`media_type` maps cached at startup, so list results carry readable genres without an extra call
- Detail tools collapse credits, videos, recommendations, similar, keywords, and external ids into one HTTP call via `append_to_response`
- Region-aware streaming availability backed by JustWatch — region is always an explicit input, never assumed

Agent-friendly output:

- TMDB attribution on every response — surfaced in `enrichment.attribution` so it reaches both the `structuredContent` and `content[]` client surfaces
- Provenance and pagination on list responses — total-result counts, page/total-pages, and an effective-filter notice so agents can reason about what was actually queried
- Empty results and empty provider regions return normally with recovery guidance, not as errors — "no titles matched" and "not streamable here" are real answers an agent must act on
- Region and truncation caveats are explicit — watch-provider results always state the region; capped filmographies disclose the pre-cap totals

## Getting started

A TMDB API Read Access Token is required. Create a free TMDB account, then copy the **API Read Access Token** (a v4 JWT) from your [API settings](https://www.themoviedb.org/settings/api) — this server authenticates v3 endpoints with `Authorization: Bearer <token>`, not the legacy `?api_key=` query parameter.

Add the following to your MCP client configuration file.

```json
{
  "mcpServers": {
    "tmdb-mcp-server": {
      "type": "stdio",
      "command": "bunx",
      "args": ["@cyanheads/tmdb-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "TMDB_API_KEY": "your-tmdb-read-access-token"
      }
    }
  }
}
```

Or with npx (no Bun required):

```json
{
  "mcpServers": {
    "tmdb-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cyanheads/tmdb-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "TMDB_API_KEY": "your-tmdb-read-access-token"
      }
    }
  }
}
```

Or with Docker:

```json
{
  "mcpServers": {
    "tmdb-mcp-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MCP_TRANSPORT_TYPE=stdio",
        "-e", "TMDB_API_KEY=your-tmdb-read-access-token",
        "ghcr.io/cyanheads/tmdb-mcp-server:latest"
      ]
    }
  }
}
```

For Streamable HTTP, set the transport and start the server:

```sh
MCP_TRANSPORT_TYPE=http MCP_HTTP_PORT=3010 TMDB_API_KEY=... bun run start:http
# Server listens at http://localhost:3010/mcp
```

Refer to "your MCP client configuration file" generically — different clients use different config paths, and this server isn't client-specific.

### Prerequisites

- [Bun v1.3.2](https://bun.sh/) or higher (or Node.js v24+).
- A TMDB **API Read Access Token** (v4 JWT) — free from your [TMDB API settings](https://www.themoviedb.org/settings/api).

### Installation

1. **Clone the repository:**

```sh
git clone https://github.com/cyanheads/tmdb-mcp-server.git
```

2. **Navigate into the directory:**

```sh
cd tmdb-mcp-server
```

3. **Install dependencies:**

```sh
bun install
```

4. **Configure environment:**

```sh
cp .env.example .env
# edit .env and set TMDB_API_KEY
```

## Configuration

All configuration is validated at startup via Zod schemas. Key environment variables:

| Variable | Description | Default |
|:---|:---|:---|
| `TMDB_API_KEY` | **Required.** TMDB v4 API Read Access Token (JWT), sent as `Authorization: Bearer`. Not the v3 `?api_key=` value. | — |
| `TMDB_LANGUAGE` | Default response language as ISO 639-1, optionally with region (e.g. `en-US`). A per-call `language` input overrides it. | `en-US` |
| `TMDB_DEFAULT_REGION` | Default ISO 3166-1 country hint used in region-aware error messages. `tmdb_get_watch_providers` still requires an explicit `watch_region`. | `US` |
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | Port for the HTTP server. | `3010` |
| `MCP_AUTH_MODE` | Auth mode: `none`, `jwt`, or `oauth`. | `none` |
| `MCP_LOG_LEVEL` | Log level (RFC 5424). | `info` |
| `STORAGE_PROVIDER_TYPE` | Storage backend. | `in-memory` |
| `OTEL_ENABLED` | Enable [OpenTelemetry instrumentation](https://github.com/cyanheads/mcp-ts-core/tree/main/docs/telemetry) (spans, metrics, completion logs). | `false` |

See [`.env.example`](./.env.example) for the full list of optional overrides.

## Running the server

### Local development

- **Build and run:**

  ```sh
  # One-time build
  bun run rebuild

  # Run the built server
  bun run start:stdio
  # or
  bun run start:http
  ```

- **Run checks and tests:**

  ```sh
  bun run devcheck   # Lint, format, typecheck, security
  bun run test       # Vitest test suite
  bun run lint:mcp   # Validate MCP definitions against spec
  ```

### Docker

```sh
docker build -t tmdb-mcp-server .
docker run --rm -e TMDB_API_KEY=your-token -p 3010:3010 tmdb-mcp-server
```

The Dockerfile defaults to HTTP transport, stateless session mode, and logs to `/var/log/tmdb-mcp-server`. OpenTelemetry peer dependencies are installed by default — build with `--build-arg OTEL_ENABLED=false` to omit them.

## Project structure

| Directory | Purpose |
|:---|:---|
| `src/index.ts` | `createApp()` entry point — registers tools and resources, and primes the startup cache in `setup()`. |
| `src/config` | Server-specific environment variable parsing and validation with Zod. |
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`) — the eight TMDB tools. |
| `src/mcp-server/resources` | Resource definitions (`*.resource.ts`) — movie, TV, and person detail. |
| `src/services/tmdb` | TMDB v3 REST client — Bearer auth, retry/timeout, the image/genre startup cache, and the `imageUrl`/`genreNames` helpers. |
| `tests/` | Unit and integration tests mirroring `src/`. |

## Development guide

See [`AGENTS.md`](./AGENTS.md) (or [`CLAUDE.md`](./CLAUDE.md), the same content) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources via the barrels in `src/mcp-server/*/definitions/index.ts`
- Wrap the TMDB API: validate raw → normalize to the domain type → return the output schema; never fabricate missing fields (null poster paths omit the URL, unknown genre ids are dropped)

## Contributing

Issues and pull requests are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.

---

<img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB" height="20"> This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch via TMDB and is region-specific.
