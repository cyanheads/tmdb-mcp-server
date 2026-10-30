<div align="center">
  <h1>@cyanheads/tmdb-mcp-server</h1>
  <p><b>Search movies, TV, and people on The Movie Database (TMDB) — credits, ratings, trailers, images, recommendations, and region-aware streaming availability via MCP. STDIO or Streamable HTTP.</b>
  <div>8 Tools • 4 Resources • 1 Skill</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.5-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/tmdb-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^2.4.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/tmdb-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/tmdb-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^7.0.2-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.4.4%2B-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/tmdb-mcp-server/releases/latest/download/tmdb-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tmdb-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvdG1kYi1tY3Atc2VydmVyIl0sImVudiI6eyJUTURCX0FQSV9LRVkiOiJ5b3VyLXRtZGItcmVhZC1hY2Nlc3MtdG9rZW4ifX0=) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22tmdb-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Ftmdb-mcp-server%22%5D%2C%22env%22%3A%7B%22TMDB_API_KEY%22%3A%22your-tmdb-read-access-token%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

---

## Overview

Movie and TV metadata powered by The Movie Database (TMDB). Search titles and people by name, pull full credits and filmographies, discover titles by filtered criteria, track trending content, and check where to stream in your region.

### Tools

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

### Resources

| Resource | Description |
|:---|:---|
| `tmdb://movie/{movie_id}` | Movie detail by id, as injectable context — the same enriched record as `tmdb_get_movie`. |
| `tmdb://tv/{series_id}` | Show detail by id — the same enriched record as `tmdb_get_show`. |
| `tmdb://person/{person_id}` | Person detail with the first 50 cast and 50 crew credits and full totals; use `tmdb_get_person` for further pages. |
| `skill://tmdb-guide/SKILL.md` | Agent guide for regional watchlists, directing credits, filmography paging, and season traversal. |

## Capability reference

### `tmdb_search_titles` <sub>tool</sub>

- `multi` mode (default) mixes movies, shows, and people, tagged with `media_type`; `movie`, `tv`, or `person` restrict to one type
- Optional `year` (movie/tv modes), `language`, `include_adult`, and `page`; empty results return normally with recovery guidance
- Each result carries `id`, `media_type`, title/name, `release_year`, `overview`, `vote_average`, `genre_names`, and a poster or profile URL

---

### `tmdb_get_movie` <sub>tool</sub>

- Returns credits, videos, recommendations, similar, keywords, external ids, and release dates in one call; trim the `append` array (e.g. `["credits"]`) to shrink the payload
- Includes US certification, top-billed cast, key crew, and YouTube trailers with watch URLs
- No streaming availability; use `tmdb_get_watch_providers`

---

### `tmdb_get_show` <sub>tool</sub>

- Same `append` options as `tmdb_get_movie`, with `content_ratings` (US TV rating) in place of `release_dates`
- Adds season summaries, creators, networks, and the last/next episode to air
- Pass a `season_number` from `seasons[]` to `tmdb_get_season` for episodes

---

### `tmdb_get_season` <sub>tool</sub>

- Per-episode names, air dates, runtimes, vote averages, still URLs, and guest stars
- Also returns the season's regular cast
- `series_id` is echoed from the input; season 0 is "Specials"

---

### `tmdb_get_person` <sub>tool</sub>

- Biography, vital dates, place of birth, known-for department, aliases, gender, and external ids (IMDb, Wikidata, social handles)
- `combined_credits` split into `cast_credits` and `crew_credits`, newest first; `credits_page` (default 1) returns up to 50 of each, with full totals on every page
- Follow `next_credits_page` for more; pages past the end return empty lists

---

### `tmdb_discover_titles` <sub>tool</sub>

- Filter by `with_genres`/`without_genres`, `year` or a `release_date_gte`/`lte` window, `vote_average` range, `vote_count_gte`, `with_cast`/`with_crew` (movie), `with_networks` (tv), `with_watch_providers` + `watch_region`, `with_original_language`, and `runtime` range
- Sort by popularity, revenue, vote average, vote count, or release date; pair `vote_average.desc` with `vote_count_gte` (~100–1000) to keep low-vote titles out of the top
- Filters that don't apply to the media type produce a notice; `with_watch_providers` without `watch_region` returns `region_required`

---

### `tmdb_get_trending` <sub>tool</sub>

- `media_type`: `all` (default) mixes movies, shows, and people; or restrict to one type
- `time_window`: `day` or `week` (default)
- Up to 20 results per page, with `page` for more; empty results return normally with recovery guidance

---

### `tmdb_get_watch_providers` <sub>tool</sub>

- Returns flatrate, rent, buy, ads, and free provider lists with logo URLs, plus the TMDB JustWatch `link`
- `watch_region` (ISO 3166-1 alpha-2) is required; the response always states the region
- An empty result means not streamable in that region; provider ids feed `with_watch_providers` in `tmdb_discover_titles`

---

### `tmdb://movie/{movie_id}` <sub>resource</sub>

- Same record as `tmdb_get_movie` — `application/json`
- `movie_id` comes from `tmdb_search_titles` or `tmdb_discover_titles`
- Typed `movie_not_found` error when TMDB returns 404 for the id

---

### `tmdb://tv/{series_id}` <sub>resource</sub>

- Same record as `tmdb_get_show` — `application/json`
- `series_id` comes from `tmdb_search_titles` or `tmdb_discover_titles`
- Typed `show_not_found` error when TMDB returns 404 for the id

---

### `tmdb://person/{person_id}` <sub>resource</sub>

- Person detail with the first 50 cast and 50 crew credits and full totals — `application/json`; use `tmdb_get_person` for further pages
- `person_id` comes from `tmdb_search_titles` (mode "person")
- Typed `person_not_found` error when TMDB returns 404 for the id

### `skill://tmdb-guide/SKILL.md` <sub>resource</sub>

- The `tmdb-guide` skill covers identifier sources, regional provider categories, directing-credit verification, and multi-step research gates
- Available through MCP skill discovery and resource reads; included in plugin installs, npm, Docker, and MCPB bundles

## Features

Built on [`@cyanheads/mcp-ts-core`](https://github.com/cyanheads/mcp-ts-core): stdio and Streamable HTTP transports, pluggable auth (`none` / `jwt` / `oauth`), swappable storage (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`), structured logging with optional OpenTelemetry tracing.

TMDB-specific:

- Typed client for the TMDB v3 REST API, authenticated with a v4 Read Access Token
- Image paths resolved to full image URLs; missing paths omit the field
- Genre ids resolved to genre names, so list results are readable without an extra call
- Detail tools return credits, videos, recommendations, keywords, and external ids in one request
- Region-aware streaming availability backed by JustWatch; region is always an explicit input

Agent-friendly output:

- TMDB attribution on every response in `enrichment.attribution`
- List responses carry total counts, page/total-pages, and a notice of the filters actually applied
- Empty results return normally with recovery guidance, not as errors
- Watch-provider results always state the region; capped filmographies disclose their full totals

## Getting started

A TMDB API Read Access Token is required. Create a free TMDB account, then copy the **API Read Access Token** (a v4 JWT) from your [API settings](https://www.themoviedb.org/settings/api) — this server authenticates v3 endpoints with `Authorization: Bearer <token>`, not the legacy `?api_key=` query parameter.

Add it to Claude Code:

```sh
claude mcp add tmdb-mcp-server -e TMDB_API_KEY=your-tmdb-read-access-token -- npx -y @cyanheads/tmdb-mcp-server
```

For other clients, add this to the MCP configuration file:

```json
{
  "mcpServers": {
    "tmdb-mcp-server": {
      "command": "npx",
      "args": ["-y", "@cyanheads/tmdb-mcp-server"],
      "env": {
        "TMDB_API_KEY": "your-tmdb-read-access-token"
      }
    }
  }
}
```

For Docker or a source build, see [Running the server](#running-the-server).

## Configuration

All configuration is validated at startup via Zod schemas. Key environment variables:

| Variable | Description | Default |
|:---|:---|:---|
| `TMDB_API_KEY` | **Required.** TMDB v4 API Read Access Token (JWT). | — |
| `TMDB_LANGUAGE` | Default response language (e.g. `en-US`); a per-call `language` overrides it. | `en-US` |
| `TMDB_DEFAULT_REGION` | Region shown in the missing-`watch_region` hint; never applied to queries. | `US` |
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | Port for the HTTP server. | `3010` |
| `MCP_AUTH_MODE` | Auth mode: `none`, `jwt`, or `oauth`. | `none` |
| `MCP_LOG_LEVEL` | Log level (RFC 5424). | `info` |
| `LOG_TOOL_FAILURE_PAYLOADS` | Log failed tool arguments and results, redacted by key name and capped at `LOG_TOOL_FAILURE_PAYLOAD_MAX_BYTES` (default `16384`). Free-form values may contain secrets. | `false` |
| `STORAGE_PROVIDER_TYPE` | Storage backend. | `in-memory` |
| `OTEL_ENABLED` | Enable [OpenTelemetry instrumentation](https://github.com/cyanheads/mcp-ts-core/tree/main/docs/telemetry) (spans, metrics, completion logs). | `false` |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | OTLP log endpoint. | — |

See [`.env.example`](./.env.example) for the full list of optional overrides.

## Running the server

### Local development

Requires [Bun v1.4.0](https://bun.sh/) or higher (or Node.js v24+).

```sh
git clone https://github.com/cyanheads/tmdb-mcp-server.git
cd tmdb-mcp-server && bun install
cp .env.example .env   # set TMDB_API_KEY
```

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
docker run --rm -e TMDB_API_KEY=your-token -p 3010:3010 ghcr.io/cyanheads/tmdb-mcp-server:latest
```

The image defaults to HTTP transport, stateless sessions, and logs to `/var/log/tmdb-mcp-server`. For stdio, use `docker run -i --rm -e MCP_TRANSPORT_TYPE=stdio -e TMDB_API_KEY=your-token ghcr.io/cyanheads/tmdb-mcp-server:latest`. Build locally with `docker build -t tmdb-mcp-server .`; OpenTelemetry peers are included by default, or omitted with `--build-arg OTEL_ENABLED=false`.

## Project structure

| Directory | Purpose |
|:---|:---|
| `src/index.ts` | `createApp()` entry point — registers tools and resources. |
| `src/config` | Server-specific environment variable parsing and validation with Zod. |
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`) — the eight TMDB tools. |
| `src/mcp-server/resources` | Resource definitions (`*.resource.ts`) — movie, TV, and person detail. |
| `src/services/tmdb` | TMDB v3 REST client. |
| `tests/` | Unit and integration tests mirroring `src/`. |
| `skills/` | Published agent guide for calling the TMDB tools. |

## Development guide

See [`AGENTS.md`](./AGENTS.md) (or [`CLAUDE.md`](./CLAUDE.md), the same content) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources via the barrels in `src/mcp-server/*/definitions/index.ts`
- Wrap external API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields

## Attribution

<img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB" height="20"> This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch via TMDB and is region-specific.

## Contributing

Issues are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
