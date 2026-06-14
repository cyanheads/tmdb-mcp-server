# tmdb-mcp-server — Design

Film and television metadata via The Movie Database (TMDB) v3 REST API — search across movies, shows, and people; full credits, ratings, trailers, images, recommendations, and region-aware streaming availability (JustWatch). Search-before-detail (integer IDs); image paths resolved to full URLs; related sub-resources collapsed via `append_to_response`.

> **Attribution (mandatory):** This product uses the TMDB API but is not endorsed or certified by TMDB. Surfaced in the README and in every tool's output `enrichment.attribution`. Watch-provider data is JustWatch-sourced and **region-specific** — never imply global availability.

---

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `tmdb_search_titles` | Search movies, TV, and people by name. Required first step — TMDB keys on integer IDs, not titles. Returns ranked results with `id`, `media_type`, title/name, year, overview, `vote_average`, genre names, and full poster/profile URLs. | `query`, `mode`, `year`, `language`, `include_adult`, `page` | `readOnlyHint`, `openWorldHint` |
| `tmdb_get_movie` | Full movie detail by id. Synopsis, runtime, genres, release date, US certification, budget/revenue, votes, full cast + key crew, trailer keys, poster/backdrop URLs, recommendations, similar, keywords. One call via `append_to_response`. | `movie_id`, `language`, `append` | `readOnlyHint`, `idempotentHint` |
| `tmdb_get_show` | Full TV show detail by id. Overview, genres, first/last air date, status, season/episode counts, creators, networks, season summaries, cast, trailers, recommendations. Mirror of `get_movie` for series. | `series_id`, `language`, `append` | `readOnlyHint`, `idempotentHint` |
| `tmdb_get_season` | Episode list for one season of a show. Episode names, air dates, overviews, guest stars, still URLs, vote averages. Bridges the gap between show-level summary and per-episode detail. | `series_id`, `season_number`, `language` | `readOnlyHint`, `idempotentHint` |
| `tmdb_get_person` | Person detail by id. Biography, birth/death, place of birth, known-for department, and `combined_credits` — full filmography as cast and crew. | `person_id`, `language` | `readOnlyHint`, `idempotentHint` |
| `tmdb_discover_titles` | Filtered title discovery (movie or tv). Genre(s), release-year range, vote range, vote-count floor, cast/crew (movie), network (tv), watch providers + region, language, runtime, sort (popularity/revenue/vote/date). The power-query entry point. | `media_type`, `sort_by`, `with_genres`, `year`/`release_date_*`, `vote_average_*`, `vote_count_gte`, `with_cast`, `with_crew`, `with_networks`, `with_watch_providers`+`watch_region`, `with_original_language`, `runtime_*`, `page` | `readOnlyHint`, `openWorldHint` |
| `tmdb_get_trending` | Trending movies, TV, or people for the day or week. Ranked entities with standard summary fields. | `media_type`, `time_window`, `language`, `page` | `readOnlyHint`, `openWorldHint` |
| `tmdb_get_watch_providers` | Where a title streams, by region. flatrate/rent/buy/ads/free provider lists with logo URLs and the JustWatch-backed TMDB link, for one country. | `media_type`, `id`, `watch_region` | `readOnlyHint`, `openWorldHint` |

### Resources

| URI Template | Description | Pagination |
|:-------------|:------------|:-----------|
| `tmdb://movie/{movie_id}` | Movie detail by id. Injectable context for chat about a specific film. | No |
| `tmdb://tv/{series_id}` | Show detail by id. Injectable context for chat about a specific series. | No |
| `tmdb://person/{person_id}` | Person detail by id. Injectable context for chat about a specific person. | No |

Each resource resolves through the same service method as its paired tool (`getMovie` / `getShow` / `getPerson`) with default append set, so resource-supporting clients get the enriched record. All three are fully reachable via the tool surface — resources are convenience only.

### Prompts

None. The server is data/lookup-oriented; no recurring multi-step interaction pattern warrants a template. (Revisit if a "watchlist analysis" workflow tool is added later — see Known Limitations.)

---

## Overview

Read-only access to TMDB — the de-facto open film/TV catalog: broad, multilingual, well-maintained, with a JustWatch-powered streaming-availability layer. The fleet has `openlibrary` for books and a planned `nytimes` for reviews but **no entertainment catalog**; TMDB fills that gap with the structured catalog (who made it, what it's rated, what it's like, where it streams).

**Audience:** media/entertainment tooling, recommendation and "what should I watch" workflows, researchers and fans, agents needing structured film/TV facts or streaming context.

**Single API, single service.** Every endpoint shares one base URL (`https://api.themoviedb.org/3`), one auth scheme (Bearer), and one rate-limit regime (~50 req/sec — effectively a non-constraint for conversational use). No multi-source aggregation; no fallback chains.

---

## Requirements

- Read-only; no write, account, rating, or list-management operations (those require user-session auth — out of scope).
- **Bearer auth** on all v3 endpoints — see Auth below. The provisioned `TMDB_API_KEY` is a v4 API Read Access Token (JWT); it authenticates v3 via the `Authorization` header, **not** the `?api_key=` query param.
- Search-before-detail: `tmdb_search_titles` resolves names → integer IDs that the detail tools consume.
- **Image URLs, never raw paths.** Every `*_path` field (`poster_path`, `backdrop_path`, `profile_path`, `still_path`, `logo_path`) is resolved to a full `https://image.tmdb.org/t/p/{size}{path}` URL before it leaves the server.
- **Genre names, never bare IDs.** Discover/search/trending return `genre_ids[]`; the server resolves them to names from the cached genre maps. Detail endpoints already return full `genres[]`.
- **`append_to_response`** collapses credits/videos/recommendations/similar/keywords/external_ids into one HTTP call on the detail endpoints (search/discover/list do NOT support it).
- Startup cache of `/configuration` (image base + sizes) and `/genre/{movie,tv}/list` (id→name maps) — see Startup Cache.
- **Watch providers are region-specific** (JustWatch): require a `watch_region` country code, surface the TMDB link, never imply global availability.
- TMDB **attribution** in README + every tool output.
- Identity display name is the hyphenated machine name `tmdb-mcp-server` on every surface (`createApp` `title`, manifest `display_name`) — never Title Case.

---

## Auth

TMDB v3 accepts a Bearer token in the `Authorization` header (verified against the API config docs — the OpenAPI `securitySchemes` declares `type: apiKey, in: header, name: Authorization, x-bearer-format: bearer`). The provisioned key is a v4 **API Read Access Token** (a JWT, scope `api_read`); per TMDB, "Using the Bearer token has the added benefit of being a single authentication process that you can use across both the v3 and v4 methods."

**The client always sends `Authorization: Bearer ${TMDB_API_KEY}` and never the `?api_key=` query parameter** (the JWT is not a valid v3 query key). This is the single most important client decision — pin it in the service layer and in any handoff/prompt that touches the HTTP client.

```
curl --request GET \
     --url 'https://api.themoviedb.org/3/movie/11' \
     --header 'Authorization: Bearer <TMDB_API_KEY>'
```

MCP-side auth (`MCP_AUTH_MODE`) is `none` by default — this is a public read-only data server; no per-tool `auth` scopes. (If hosted behind JWT later, scopes can be added without surface changes.)

---

## Services

| Service | Wraps | Used By |
|:--------|:------|:--------|
| `TmdbService` | TMDB v3 REST (`/search/*`, `/movie/{id}`, `/tv/{id}`, `/tv/{id}/season/{n}`, `/person/{id}`, `/discover/*`, `/trending/*`, `/*/watch/providers`, `/configuration`, `/genre/*/list`) | All tools + resources |

Single service. All endpoints share base URL, Bearer auth, retry/timeout config, and the image/genre cache. No benefit to splitting.

**Resilience** (per the design-skill resilience table):

| Concern | Decision |
|:--------|:---------|
| HTTP client | `fetchWithTimeout(url, 15_000, ctx, { headers, signal })` from `/utils`; `Authorization` header injected by the service. |
| Retry boundary | `withRetry` wraps the full fetch+parse pipeline. `baseDelayMs: 500` (TMDB is fast and rarely rate-limits at conversational volume). |
| Non-OK status | Map via `httpErrorFromResponse(response, { service: 'TMDB', data })` from `/utils` — captures 401/404/422/429/5xx + `Retry-After`. 404 → `NotFound`; 401 → surfaced as a config/auth error (bad token); 429 → `RateLimited` (retryable). |
| HTML-error guard | Detect an HTML body (`/^\s*<(!DOCTYPE\s+html|html[\s>])/i`) and throw a transient error rather than `SerializationError`. |
| Cache fetch | `/configuration` + both genre lists fetched once in `setup()`; failure there fails startup loudly (the server cannot build image URLs or resolve genres without them — let it crash, don't degrade). |

**Image/genre helpers (service-internal, pure):**

- `imageUrl(path: string | null | undefined, size: string): string | undefined` — returns `${secureBaseUrl}${size}${path}` or `undefined` when `path` is null/absent. Never returns a raw path.
- `genreNames(ids: number[], kind: 'movie' | 'tv'): string[]` — maps ids to names via the cached map; unknown ids are dropped (don't fabricate).
- Default size constants: poster `w500`, backdrop `w780`, profile `w185`, still `w300`, logo `w92`. (All are valid per the cached size arrays; chosen for a reasonable display/context tradeoff. Sizes are not exposed as tool inputs — see Decisions Log.)

---

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `TMDB_API_KEY` | **Yes** | TMDB v4 API Read Access Token (JWT). Sent as `Authorization: Bearer ${TMDB_API_KEY}`. Missing → `ConfigurationError` at startup naming the variable. |
| `TMDB_LANGUAGE` | No | Default ISO 639-1 (optionally `-COUNTRY`) language for responses, e.g. `en-US`. Default `en-US`. Per-call `language` input overrides it. |
| `TMDB_DEFAULT_REGION` | No | Default ISO 3166-1 country for watch-provider and region-aware queries, e.g. `US`. Used only as a fallback hint in error messages; `tmdb_get_watch_providers` still **requires** an explicit `watch_region` (region must be a conscious choice). |

`src/config/server-config.ts`, separate Zod schema, via `parseEnvConfig`:

```ts
const ServerConfigSchema = z.object({
  apiKey: z.string().min(1).describe('TMDB v4 API Read Access Token (Bearer).'),
  language: z.string().default('en-US').describe('Default response language (ISO 639-1[-COUNTRY]).'),
  defaultRegion: z.string().default('US').describe('Default ISO 3166-1 region hint.'),
});
// parseEnvConfig(ServerConfigSchema, {
//   apiKey: 'TMDB_API_KEY', language: 'TMDB_LANGUAGE', defaultRegion: 'TMDB_DEFAULT_REGION',
// })
```

`server.json` `environmentVariables[]` and `manifest.json` `user_config` carry `TMDB_API_KEY` (required, secret) and the two optional vars; `lint:packaging` verifies the names match.

---

## Startup Cache

Two datasets that change rarely but are needed on **every** response are fetched once in `createApp({ setup })` (which supports `async`) and held in the service instance for process lifetime. No `ctx.state` — this is global, read-only, non-tenant data.

| Cached | Endpoint | Shape used | Used for |
|:-------|:---------|:-----------|:---------|
| Image config | `GET /configuration` | `images.secure_base_url` + `{poster,backdrop,profile,still,logo}_sizes` | building full image URLs |
| Movie genres | `GET /genre/movie/list` | `genres: [{ id, name }]` → `Map<number,string>` | resolving `genre_ids[]` on movie search/discover/trending |
| TV genres | `GET /genre/tv/list` | `genres: [{ id, name }]` → `Map<number,string>` | resolving `genre_ids[]` on tv search/discover/trending |

```ts
// index.ts
await createApp({
  name: 'tmdb-mcp-server',
  title: 'tmdb-mcp-server',
  instructions: '…',          // see below
  tools: [...],
  resources: [...],
  async setup() {
    await initTmdbService();   // parses config, fetches /configuration + both genre lists, builds maps
  },
});
```

- The three fetches run with `Promise.all` (independent). Any failure throws — startup aborts with a clear banner. There is no silent fallback: without the image base the server cannot honor "full URLs, never raw paths," and without genre maps it cannot honor "names, never bare IDs."
- `secure_base_url` (`https://image.tmdb.org/t/p/`) is preferred over `base_url` (http).
- The cache is verified live: `secure_base_url` and the five size arrays are confirmed present in the `/configuration` response (`poster_sizes`, `backdrop_sizes`, `profile_sizes`, `still_sizes`, `logo_sizes`).

**Server `instructions`** (forwarded on every `initialize`):

> Use the tmdb_* tools for film/TV/person data via TMDB. TMDB keys on integer IDs — start with tmdb_search_titles to resolve a name to an id, then tmdb_get_movie / tmdb_get_show / tmdb_get_person. tmdb_discover_titles is the power-query for filtered browsing (genre, year, rating, sort); tmdb_get_trending for what's hot. Streaming availability (tmdb_get_watch_providers) is region-specific — pass a country code; results never imply global availability. Image fields are returned as full URLs. This product uses the TMDB API but is not endorsed or certified by TMDB.

---

## Image URL Construction

A worked example, verified against the TMDB image-basics docs: a `poster_path` of `/1E5baAaEse26fej7uHcjOgEE2t2.jpg` at size `w500` →

```
https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHcjOgEE2t2.jpg
   └──────── secure_base_url ────────┘└size┘└──────────── file_path ────────────┘
```

Rules:
- `imageUrl(path, size)` returns `undefined` when `path` is null/absent (TMDB returns `null` posters frequently) — the output field is then optional/omitted, never a bare path or a broken URL.
- `file_path` values already include the leading `/` — concatenate directly, don't insert a separator.
- Logo paths (`provider.logo_path`, network/company logos) are `.png` and resolve the same way; default logo size `w92`.
- Sizes come from the cached arrays; the chosen defaults (`w500`/`w780`/`w185`/`w300`/`w92`) are all members of their respective arrays.

---

## Enrichment Plan

Every tool populates an `enrichment` block (the success-path counterpart to `errors[]`, reaching both `structuredContent` and `content[]` via `ctx.enrich`). Common fields across tools:

| Enrichment field | Kind | Where | Notes |
|:-----------------|:-----|:------|:------|
| `attribution` | echo (string) | all tools | Constant: `This product uses the TMDB API but is not endorsed or certified by TMDB.` Satisfies the mandatory-attribution requirement on every response surface. |
| `totalCount` | total | list tools (search, discover, trending) | `ctx.enrich.total(total_results)`. **Required** field — populated on every list response (including empty). |
| `notice` | notice | list/detail tools | Empty-result recovery guidance, or region caveats. |
| `queryEcho` | echo | search, discover | The effective filters as the server parsed them — so the agent sees what was actually queried. |

**Capped-list truncation — declared OPTIONAL.** TMDB paginates at 20 results/page. List tools return one page as-is and disclose pagination via `totalCount` (required, via the total enricher) plus `page`/`totalPages` in `output`. They do **not** apply a server-side cap that slices a larger fetched set, so `ctx.enrich.truncated()` is generally not fired — and the framework only populates `truncated`/`shown`/`cap` when a cap is actually hit. Per the hard constraint, any truncation fields stay optional in the schema; declaring them required would throw -32007 on every non-truncated result. (If a future tool fetches multiple pages and slices, it would fire `ctx.enrich.truncated({ shown, cap })` then.)

`ctx.enrich.echo(...)` renders scalar echoes cleanly; structured enrichment (none needed here beyond scalars) would require an `enrichmentTrailer.render`.

---

## Endpoint Mapping

| Tool | TMDB endpoint(s) | `append_to_response` |
|:-----|:-----------------|:---------------------|
| `tmdb_search_titles` | `GET /search/multi` (mode=multi) · `/search/movie` · `/search/tv` · `/search/person` | — (search does not support append) |
| `tmdb_get_movie` | `GET /movie/{movie_id}` | `credits,videos,recommendations,similar,keywords,external_ids,release_dates` |
| `tmdb_get_show` | `GET /tv/{series_id}` | `credits,videos,recommendations,similar,keywords,external_ids,content_ratings` |
| `tmdb_get_season` | `GET /tv/{series_id}/season/{season_number}` | `credits` (gives season-level regular cast; guest stars are already in each episode object without append). `series_id` is NOT in the API response — echo it from the input parameter. Season root also includes `vote_average` (season aggregate). |
| `tmdb_get_person` | `GET /person/{person_id}` | `combined_credits,external_ids` |
| `tmdb_discover_titles` | `GET /discover/movie` · `GET /discover/tv` | — (discover does not support append). Range/filter param translation: Zod snake_case fields → API dot-notation (e.g. `vote_count_gte` → `vote_count.gte`). Array fields: `with_genres`/`without_genres` joined with `,`; `with_cast`/`with_crew`/`with_networks`/`with_watch_providers` joined with `|`. |
| `tmdb_get_trending` | `GET /trending/{all\|movie\|tv\|person}/{day\|week}` | — |
| `tmdb_get_watch_providers` | `GET /movie/{id}/watch/providers` · `GET /tv/{id}/watch/providers` | — |
| Startup cache | `GET /configuration` · `GET /genre/movie/list` · `GET /genre/tv/list` | — |

**Detail tools do NOT append `watch/providers`.** Watch data is region-specific and the detail tools take no region; appending it would return TMDB's full all-countries blob (large, and easy to misread as global). Region-scoped availability is the dedicated `tmdb_get_watch_providers` tool's job. The detail tools mention this in their description.

---

## Workflow Analysis

`tmdb_get_movie` / `tmdb_get_show` are the multi-sub-resource workflow tools (one HTTP call, many appended namespaces). The append set drives the output schema and the normalization the service performs:

`tmdb_get_movie` (1 HTTP call, fans out internally via append):

| # | Namespace | Source | Output mapping |
|:--|:----------|:-------|:---------------|
| 1 | (root) | `/movie/{id}` | title, overview, runtime, status, `release_date`, genres (full), budget, revenue, `vote_average`/`vote_count`, `imdb_id`(via external_ids), poster/backdrop URLs, homepage, tagline |
| 2 | `credits` | appended | `cast[]` (name, character, profile URL, order) capped to top N; `crew[]` filtered to key roles (Director, Writer, Screenplay, Creator) |
| 3 | `videos` | appended | trailers/teasers — filtered to YouTube `site`, surface `key` + a `https://www.youtube.com/watch?v={key}` URL + type/name |
| 4 | `recommendations` | appended | id, title, media_type, year, poster URL, vote_average (summary cards) |
| 5 | `similar` | appended | same summary shape |
| 6 | `keywords` | appended | `keywords[]` (id, name) |
| 7 | `release_dates` | appended | US certification extracted (`results[].iso_3166_1 == 'US'` → prefer type-3 theatrical entry's non-empty `certification`; fallback to first non-empty `certification` across all release types) |
| 8 | `external_ids` | appended | `imdb_id`, plus optional `wikidata_id`, `facebook_id`, etc. — for cross-server chaining |

`tmdb_get_show` mirrors this; `content_ratings` replaces `release_dates` for the US certification, and the root adds `seasons[]` summaries (season_number, name, episode_count, air_date, poster URL), `created_by[]`, `networks[]` (name, logo URL), `first/last_air_date`, `number_of_seasons/episodes`, `status`, `last_episode_to_air`/`next_episode_to_air`.

The table answers the implementation questions early: which append keys, how `cast`/`crew` are trimmed (top-N cast, role-filtered crew), how videos are filtered (YouTube trailers), and where the certification comes from (the `release_dates`/`content_ratings` namespace, not the root).

---

## Tool Design Details

Conventions across all tools: `language` is an optional ISO-639-1[-COUNTRY] string defaulting to the configured `TMDB_LANGUAGE`. All image fields in outputs are full URLs (optional — omitted when the upstream path is null). All list tools return `page`, `total_pages`, `total_results`, and a `results[]` array; `totalCount` is carried via `ctx.enrich.total`.

### `tmdb_search_titles`

**Purpose:** name → ranked results with integer IDs. The required entry point.

**Input:**
```ts
z.object({
  query: z.string().min(1)
    .describe('Search text — a movie, show, or person name. Required.'),
  mode: z.enum(['multi', 'movie', 'tv', 'person']).default('multi')
    .describe('What to search. "multi" (default) returns mixed movies, shows, and people ranked together — each result carries media_type. "movie"/"tv"/"person" restrict to one type and enable type-specific ranking.'),
  year: z.number().int().min(1850).max(2100).optional()
    .describe('Filter by release/first-air year. Applies to movie and tv modes; ignored for person and multi.'),
  language: z.string().optional()
    .describe('Response language as ISO 639-1, optionally with region (e.g. "en-US", "fr"). Defaults to the server-configured language.'),
  include_adult: z.boolean().default(false)
    .describe('Include adult-content results. Default false.'),
  page: z.number().int().min(1).max(500).default(1)
    .describe('Result page (TMDB returns 20 per page). Use to fetch beyond the first 20.'),
})
```

**Output:** `page`, `total_pages`, `total_results`, `results[]` where each item is a discriminated-ish summary:
- `id` (number — "Pass to tmdb_get_movie / tmdb_get_show / tmdb_get_person depending on media_type."), `media_type` (enum `movie|tv|person`), `title` (movie/tv display title — movie `title` or tv `name`), `release_year` (optional number), `overview` (optional string), `vote_average` (optional number), `genre_names` (optional string[] — resolved from `genre_ids`), `poster_url` (optional — movies/shows), `profile_url` (optional — people, from `profile_path`), `known_for_department` (optional — people), `known_for` (optional array of `{ id, media_type, title, poster_url? }` — media items the person is known for; these are movie/tv records, NOT person records, so they have `poster_path` not `profile_path`). In `multi` mode `media_type` distinguishes which optional fields are present.

**`format()`** renders each result with its id, media_type, title, year, vote, genres, and the relevant image URL (so `content[]`-only clients get the ids needed to chain).

**Errors:** none declared beyond baseline. An empty `results[]` is a valid response, not an error — handler fires `ctx.enrich.notice('No titles matched "<query>" in <mode> mode. Try a different spelling, broaden the mode to "multi", or drop the year filter.')` and `ctx.enrich.total(0)`.

### `tmdb_get_movie`

**Purpose:** full movie detail in one call.

**Input:**
```ts
z.object({
  movie_id: z.number().int().positive()
    .describe('TMDB movie id (integer). Obtain it from tmdb_search_titles (mode "movie" or "multi") or tmdb_discover_titles.'),
  language: z.string().optional()
    .describe('Response language (ISO 639-1[-COUNTRY]). Defaults to the server-configured language.'),
  append: z.array(z.enum(['credits','videos','recommendations','similar','keywords','external_ids','release_dates']))
    .default(['credits','videos','recommendations','similar','keywords','external_ids','release_dates'])
    .describe('Sub-resources to fold into the single request. Defaults to the full set. Trim it to reduce payload when you only need part of the record (e.g. ["credits"] for cast only).'),
})
```

**Output (key fields):** `id`, `title`, `original_title`, `tagline` (optional), `overview` (optional), `status`, `release_date` (optional), `runtime_minutes` (optional), `genres` (`{id,name}[]`), `vote_average`, `vote_count`, `popularity`, `budget` (optional), `revenue` (optional), `homepage` (optional), `imdb_id` (optional), `us_certification` (optional — from `release_dates`), `poster_url`/`backdrop_url` (optional), `cast` (optional `{ id, name, character, order, profile_url? }[]`, top ~15), `crew_key` (optional `{ id, name, job, department, profile_url? }[]` — Director/Writer/Screenplay/Producer), `trailers` (optional `{ name, key, url, type, site }[]` — YouTube), `recommendations`/`similar` (optional summary-card arrays), `keywords` (optional `{id,name}[]`), `external_ids` (optional object).

Fields gated by `append` are `.optional()` (absent when the key wasn't requested) — the handler guards on presence.

**Errors:**
```ts
errors: [
  { reason: 'movie_not_found', code: JsonRpcErrorCode.NotFound,
    when: 'TMDB returns 404 for the given movie id',
    recovery: 'Verify the id with tmdb_search_titles (mode "movie") — TMDB keys on integer ids, not titles.' },
]
```
(401 from a bad token, 429, and 5xx bubble as baseline classified errors.)

### `tmdb_get_show`

**Purpose:** full TV show detail in one call (mirror of `get_movie`).

**Input:** `series_id` (positive int — "TMDB TV series id; from tmdb_search_titles mode \"tv\"/\"multi\" or tmdb_discover_titles."), `language` (optional), `append` (array enum `['credits','videos','recommendations','similar','keywords','external_ids','content_ratings']`, default full set).

**Output (key fields):** `id`, `name`, `original_name`, `tagline` (optional), `overview` (optional), `status`, `first_air_date`/`last_air_date` (optional), `number_of_seasons`, `number_of_episodes`, `episode_run_time` (optional number[]), `genres`, `vote_average`, `vote_count`, `popularity`, `homepage` (optional), `in_production` (bool), `type` (optional), `us_content_rating` (optional — from `content_ratings`), `poster_url`/`backdrop_url` (optional), `created_by` (optional `{ id, name, profile_url? }[]`), `networks` (optional `{ id, name, logo_url?, origin_country }[]`), `seasons` (`{ season_number, name, episode_count, air_date?, overview?, poster_url? }[]` — "Pass season_number to tmdb_get_season for the episode list."), `last_episode_to_air`/`next_episode_to_air` (optional episode summaries), `cast`/`crew_key`/`trailers`/`recommendations`/`similar`/`keywords`/`external_ids` (optional, as in `get_movie`).

**Errors:**
```ts
errors: [
  { reason: 'show_not_found', code: JsonRpcErrorCode.NotFound,
    when: 'TMDB returns 404 for the given series id',
    recovery: 'Verify the id with tmdb_search_titles (mode "tv") — TMDB keys on integer ids, not titles.' },
]
```

### `tmdb_get_season`

**Purpose:** episode list for one season — bridges show-summary and per-episode detail.

**Input:**
```ts
z.object({
  series_id: z.number().int().positive()
    .describe('TMDB TV series id (from tmdb_search_titles or tmdb_get_show).'),
  season_number: z.number().int().min(0)
    .describe('Season number. 0 is the "Specials" season on TMDB. Discover valid season numbers from tmdb_get_show (seasons[].season_number).'),
  language: z.string().optional()
    .describe('Response language (ISO 639-1[-COUNTRY]). Defaults to the server-configured language.'),
})
```

**Output:** `series_id` (echoed from input — the TMDB season endpoint does not return this field), `season_number`, `name`, `overview` (optional), `air_date` (optional), `vote_average` (optional — season-level aggregate, present in the raw response), `poster_url` (optional), `episodes[]` where each: `episode_number`, `name`, `overview` (optional), `air_date` (optional), `runtime_minutes` (optional, from `runtime`), `vote_average` (optional), `still_url` (optional), `guest_stars` (optional `{ id, name, character, profile_url? }[]`).

> **Note:** Guest stars are embedded per-episode in the season response *without* any append. The season-level `credits` append (`tmdb_get_season` endpoint table row) adds the season's *regular* cast (small recurring set, e.g. 6 entries for BB S1), which is distinct from per-episode guest stars. Both are worth including: regular cast from the append, guest stars from each episode object. The `credits` append does NOT change or add to the per-episode `guest_stars` array.

**Errors:**
```ts
errors: [
  { reason: 'season_not_found', code: JsonRpcErrorCode.NotFound,
    when: 'TMDB returns 404 — the series id is wrong or the season number does not exist for this show',
    recovery: 'Confirm the series id and list valid season numbers with tmdb_get_show (seasons[].season_number) before retrying.' },
]
```

### `tmdb_get_person`

**Purpose:** person detail + full filmography.

**Input:** `person_id` (positive int — "TMDB person id; from tmdb_search_titles mode \"person\"/\"multi\"."), `language` (optional). Append is fixed internally (`combined_credits,external_ids`) — not a parameter, since both are always wanted for a person dossier.

**Output:** `id`, `name`, `biography` (optional), `birthday` (optional), `deathday` (optional), `place_of_birth` (optional), `known_for_department` (optional), `also_known_as` (optional string[]), `gender` (optional — mapped to a label: `0`→unknown,`1`→female,`2`→male,`3`→non-binary), `popularity`, `homepage` (optional), `imdb_id` (optional — **present in the root person response without any append**; `external_ids` append adds wikidata_id, facebook_id, instagram_id, tiktok_id, twitter_id, youtube_id for cross-platform chaining), `profile_url` (optional), `cast_credits` (`{ id, media_type, title, character?, release_year?, vote_average?, poster_url? }[]` — from `combined_credits.cast`), `crew_credits` (`{ id, media_type, title, job, department, release_year?, poster_url? }[]` — from `combined_credits.crew`), `external_ids` (optional object — full social/platform id set from the append).

Credits sorted by `release_year` descending (most recent first); the natural ordering is interpretable and honest (no synthetic "relevance" score). Each capped to a sane display size with the cap disclosed via the optional truncation enrichment if applied (see Enrichment Plan).

**Errors:**
```ts
errors: [
  { reason: 'person_not_found', code: JsonRpcErrorCode.NotFound,
    when: 'TMDB returns 404 for the given person id',
    recovery: 'Verify the id with tmdb_search_titles (mode "person").' },
]
```

### `tmdb_discover_titles`

**Purpose:** the power-query. Filtered, sorted discovery across movies or tv.

**Input:**
```ts
z.object({
  media_type: z.enum(['movie', 'tv'])
    .describe('Discover movies or TV shows. Determines the endpoint and which genre vocabulary applies.'),
  sort_by: z.enum([
    'popularity.desc','popularity.asc',
    'revenue.desc','revenue.asc',
    'primary_release_date.desc','primary_release_date.asc',
    'vote_average.desc','vote_average.asc',
    'vote_count.desc','vote_count.asc',
  ]).default('popularity.desc')
    .describe('Sort order. "popularity.desc" (default) for what is broadly relevant now; "vote_average.desc" for critically rated (pair with vote_count_gte to avoid tiny-sample outliers); "revenue.desc" for box office; "primary_release_date.desc" for newest. For tv, primary_release_date.desc sorts by first-air date and gives sensible results; first_air_date.desc is accepted by the API but returns bogus future-dated entries.'),
  with_genres: z.array(z.number().int()).optional()
    .describe('Genre ids to require (AND — comma-joined in the API call). Genre ids differ between movie and tv — the names appear in any movie/show result\'s genres[], and the full map is applied server-side to label results. Combine multiple to narrow (e.g. Action + Comedy).'),
  without_genres: z.array(z.number().int()).optional()
    .describe('Genre ids to exclude (AND — comma-joined in the API call).'),
  year: z.number().int().min(1850).max(2100).optional()
    .describe('Exact primary-release year (movie) / first-air year (tv). For a range, use release_date_gte/lte instead.'),
  release_date_gte: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Earliest release date, inclusive (YYYY-MM-DD).')]).optional()
    .describe('Earliest release/first-air date, inclusive (YYYY-MM-DD). Pair with release_date_lte for a window.'),
  release_date_lte: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Latest release date, inclusive (YYYY-MM-DD).')]).optional()
    .describe('Latest release/first-air date, inclusive (YYYY-MM-DD).'),
  vote_average_gte: z.number().min(0).max(10).optional()
    .describe('Minimum average rating (0–10). Use with vote_count_gte so a 10.0 from 3 votes does not dominate.'),
  vote_average_lte: z.number().min(0).max(10).optional()
    .describe('Maximum average rating (0–10).'),
  vote_count_gte: z.number().int().min(0).optional()
    .describe('Minimum number of votes. The single most useful quality gate — set ~100–1000 to exclude obscure or unrated titles when sorting by vote_average.'),
  with_cast: z.array(z.number().int()).optional()
    .describe('Person ids that must appear in the cast (movie only on TMDB; silently ignored for tv with a notice). Resolve names to ids with tmdb_search_titles mode "person". Multiple ids joined with pipe (OR) in the API call.'),
  with_crew: z.array(z.number().int()).optional()
    .describe('Person ids that must appear in the crew (movie only on TMDB). Useful for "movies directed by X" — director, writer, and other crew roles. Resolve names to ids with tmdb_search_titles mode "person". Multiple ids joined with pipe (OR) in the API call.'),
  with_networks: z.array(z.number().int()).optional()
    .describe('TV network ids to require (tv only — silently ignored for movie with a notice). Filters to shows that aired on these networks. Network ids are not directly browseable via this server — refer to the TMDB network page or known ids (e.g. 213 = Netflix, 1024 = Amazon, 2739 = Disney+). Multiple ids joined with pipe (OR) in the API call.'),
  with_original_language: z.string().optional()
    .describe('ISO 639-1 original-language code (e.g. "ja" for originally-Japanese titles). Distinct from the response language.'),
  runtime_gte: z.number().int().min(0).optional()
    .describe('Minimum runtime in minutes.'),
  runtime_lte: z.number().int().min(0).optional()
    .describe('Maximum runtime in minutes.'),
  with_watch_providers: z.array(z.number().int()).optional()
    .describe('Streaming provider ids to require. MUST be paired with watch_region — provider availability is region-specific. Provider ids come from tmdb_get_watch_providers results. Multiple ids joined with pipe (OR) in the API call.'),
  watch_region: z.union([z.literal(''), z.string().regex(/^[A-Z]{2}$/).describe('ISO 3166-1 country code (uppercase).')]).optional()
    .describe('Country for with_watch_providers, ISO 3166-1 alpha-2 (e.g. "US"). Required when with_watch_providers is set.'),
  include_adult: z.boolean().default(false)
    .describe('Include adult-content results. Default false.'),
  page: z.number().int().min(1).max(500).default(1)
    .describe('Result page (20 per page).'),
})
```

**Output:** `page`, `total_pages`, `total_results`, `results[]` of summary cards — `{ id, media_type, title, release_year?, overview?, vote_average, vote_count, genre_names, poster_url?, popularity }`. (`media_type` is set from the input `media_type` since discover endpoints are type-specific.)

**Handler guards:** if `with_watch_providers` is set but `watch_region` is empty/absent → `ctx.fail('region_required', …)`. `with_cast` and `with_crew` are silently ignored for `media_type: 'tv'` with a `ctx.enrich.notice`. `with_networks` is silently ignored for `media_type: 'movie'` with a `ctx.enrich.notice`.

**API param mapping (service layer).** The Zod input schema uses snake_case field names, but TMDB's discover API requires **dot notation** for all range and filter params. The service must translate them: `vote_count_gte` → `vote_count.gte`, `vote_average_gte` → `vote_average.gte`, `vote_average_lte` → `vote_average.lte`, `release_date_gte` → `release_date.gte`, `release_date_lte` → `release_date.lte`, `runtime_gte` → `with_runtime.gte`, `runtime_lte` → `with_runtime.lte`. Using underscore variants silently returns unfiltered results (verified live). `with_genres`, `without_genres` are joined with `,` (AND). `with_cast`, `with_crew`, `with_networks`, `with_watch_providers` are joined with `|` (OR).

**Errors:**
```ts
errors: [
  { reason: 'region_required', code: JsonRpcErrorCode.InvalidParams,
    when: 'with_watch_providers is set without a watch_region',
    recovery: 'Provide watch_region (ISO 3166-1, e.g. "US") — streaming availability is region-specific and cannot be queried globally.' },
]
```
Empty `results[]` → `ctx.enrich.notice` echoing the active filters and suggesting which to relax (commonly: lower `vote_count_gte`, widen the date range, drop a genre).

### `tmdb_get_trending`

**Purpose:** what's hot, day or week.

**Input:**
```ts
z.object({
  media_type: z.enum(['all', 'movie', 'tv', 'person']).default('all')
    .describe('Which trending list. "all" mixes movies, shows, and people (each result carries media_type).'),
  time_window: z.enum(['day', 'week']).default('week')
    .describe('Trending window. "day" is more volatile; "week" is steadier.'),
  language: z.string().optional()
    .describe('Response language (ISO 639-1[-COUNTRY]).'),
  page: z.number().int().min(1).max(500).default(1)
    .describe('Result page (20 per page).'),
})
```

**Output:** `page`, `total_pages`, `total_results`, `results[]` of mixed summary cards (same shape as `tmdb_search_titles` results — `id`, `media_type`, `title`, `release_year?`, `overview?`, `vote_average?`, `genre_names?`, `poster_url?`/`profile_url?`).

**Errors:** none declared beyond baseline.

### `tmdb_get_watch_providers`

**Purpose:** where a title streams, for one region. Also available inline via `get_movie`/`get_show` append — but this tool scopes to a region and surfaces the TMDB link.

**Input:**
```ts
z.object({
  media_type: z.enum(['movie', 'tv'])
    .describe('Whether the id is a movie or a TV show.'),
  id: z.number().int().positive()
    .describe('TMDB movie or TV id (matching media_type), from tmdb_search_titles or tmdb_discover_titles.'),
  watch_region: z.string().regex(/^[A-Z]{2}$/)
    .describe('ISO 3166-1 alpha-2 country code, uppercase (e.g. "US", "GB", "DE"). REQUIRED — streaming availability is region-specific (JustWatch); there is no global answer.'),
})
```

**Output:**
```ts
z.object({
  id: z.number().describe('The title id queried.'),
  media_type: z.enum(['movie', 'tv']),
  region: z.string().describe('The ISO 3166-1 region the availability applies to.'),
  link: z.string().optional().describe('TMDB JustWatch-backed page for this title/region — the supported way to reach actual deep links. Absent when TMDB has no provider data for the region.'),
  flatrate: z.array(ProviderSchema).describe('Subscription/streaming-included providers. Empty when none.'),
  rent: z.array(ProviderSchema).describe('Rental providers. Empty when none.'),
  buy: z.array(ProviderSchema).describe('Purchase providers. Empty when none.'),
  ads: z.array(ProviderSchema).describe('Ad-supported free providers. Empty when none.'),
  free: z.array(ProviderSchema).describe('Free providers. Empty when none.'),
})
// ProviderSchema = z.object({
//   provider_id: z.number().describe('TMDB/JustWatch provider id — pass to tmdb_discover_titles with_watch_providers.'),
//   provider_name: z.string().describe('Display name, e.g. "Netflix".'),
//   logo_url: z.string().optional().describe('Full provider logo URL.'),
//   display_priority: z.number().describe('TMDB-suggested ordering within the region (lower = higher priority).'),
// })
```

Service maps `results[<region>]` → the flat shape; the country sub-object's `link` and the `flatrate`/`rent`/`buy`/`ads`/`free` arrays are confirmed against the live watch/providers response shape. `logo_path` → `logo_url` via the image helper. When `results` has no entry for `watch_region`, all arrays are empty and `link` is absent.

**Enrichment:** `ctx.enrich.notice` always carries a region caveat — e.g. `Availability shown for region <X> only (JustWatch). Other regions differ; query each region separately.` — plus the standard `attribution`.

**Errors:**
```ts
errors: [
  { reason: 'title_not_found', code: JsonRpcErrorCode.NotFound,
    when: 'TMDB returns 404 for the given id + media_type',
    recovery: 'Verify the id and that media_type matches it (a movie id is not a tv id) via tmdb_search_titles.' },
]
```
A 200 with no providers for the region is **not** an error — it's an empty-but-valid result (a real "not available to stream here" answer); the notice explains it.

---

## Implementation Order

1. `src/config/server-config.ts` — `TMDB_API_KEY` (required), `TMDB_LANGUAGE`, `TMDB_DEFAULT_REGION`.
2. `TmdbService` — Bearer HTTP client (`fetchWithTimeout` + `withRetry` + `httpErrorFromResponse`), the `imageUrl`/`genreNames` helpers, and `initTmdbService()` that fetches `/configuration` + both genre lists in `setup()`. Plus `types.ts` for raw-response and domain shapes.
3. `tmdb_search_titles` — the entry point; exercises image + genre resolution end to end.
4. `tmdb_get_movie`, `tmdb_get_show` — the `append_to_response` workflow tools.
5. `tmdb_get_season`, `tmdb_get_person` — drill-down + filmography.
6. `tmdb_discover_titles` — the power-query (most params; build last among list tools).
7. `tmdb_get_trending`.
8. `tmdb_get_watch_providers`.
9. Resources (`tmdb://movie|tv|person/{id}`) — thin wrappers over the detail service methods.

Each step is independently testable against real API responses, including a sparse-payload case (null `poster_path`, missing `release_date`, empty provider region) per the framework checklist.

---

## Known Limitations

- **Genre ids are namespace-split.** Movie and TV genre vocabularies differ (same name can have different ids; some genres exist in only one). `with_genres` on `tmdb_discover_titles` takes ids; the server labels result genres from the correct cached map per `media_type`, but the agent supplying ids must use the right namespace. (A future `tmdb_list_genres` tool could expose the maps if this proves a friction point — deferred; the maps already surface as names in every result.)
- **Watch providers ≠ deep links.** TMDB/JustWatch returns provider presence + a TMDB link, *not* a play URL. The `link` field is the supported path to deep links. Availability is per-region and changes frequently; there is no global view.
- **`with_cast`/`with_crew` are movie-only; `with_networks` is TV-only.** TMDB discover silently ignores `with_cast`/`with_crew` for tv and `with_networks` for movie. The tool accepts these params for both `media_type` values but no-ops the inapplicable ones with a `ctx.enrich.notice`.
- **No user/account/rating/list operations.** Those require a user session (write-capable, OAuth-like). Out of scope for a read-only catalog server.
- **Person credits can be large.** Prolific people return hundreds of `combined_credits` entries; the tool caps each of cast/crew to a display size (recency-ordered) and discloses truncation. The full set is reachable by paging via discover/search where applicable.
- **Certification is US-only in the summary.** `us_certification`/`us_content_rating` extract the US entry from `release_dates`/`content_ratings`. Other regions' certifications exist in the raw namespace but aren't surfaced in the curated output (keeps the record focused; revisit if multi-region certification is requested).
- **Moonshot (deferred): watchlist analysis.** A tool that takes a list of titles, batch-fetches, and returns clustered recommendations + a combined per-region availability matrix. Not in the initial surface — it would be the one candidate for a prompt or a workflow tool later.

---

## API Reference

### Base URL
`https://api.themoviedb.org/3`

### Auth
`Authorization: Bearer ${TMDB_API_KEY}` on every request. Never `?api_key=`.

### Image base
`https://image.tmdb.org/t/p/{size}{file_path}` — `size` from cached `/configuration` arrays; `file_path` includes its leading `/`.

### Key endpoints

| Endpoint | Purpose |
|:---------|:--------|
| `GET /search/multi?query=&page=&include_adult=&language=` | Mixed name search |
| `GET /search/{movie,tv,person}?query=&year=&page=&language=` | Typed name search |
| `GET /movie/{id}?append_to_response=…&language=` | Movie detail (+ appends) |
| `GET /tv/{id}?append_to_response=…&language=` | Show detail (+ appends) |
| `GET /tv/{id}/season/{n}?language=` | Season episode list |
| `GET /person/{id}?append_to_response=combined_credits,external_ids&language=` | Person detail + filmography |
| `GET /discover/{movie,tv}?sort_by=&with_genres=&vote_count.gte=&…` | Filtered discovery |
| `GET /trending/{all,movie,tv,person}/{day,week}?language=&page=` | Trending |
| `GET /{movie,tv}/{id}/watch/providers` | Region-keyed streaming availability |
| `GET /configuration` | Image base + sizes (cached at startup) |
| `GET /genre/{movie,tv}/list?language=` | Genre id→name maps (cached at startup) |

### Pagination
`page` query param (1-indexed); 20 results/page; response carries `page`, `total_pages`, `total_results`. Max page 500 (TMDB hard cap).

### Rate limit
~50 req/sec (per TMDB). Effectively a non-constraint for conversational use; `withRetry` covers transient 429s. No aggressive caching beyond the startup config/genre cache.

### Error envelope
Non-200 responses carry `{ "success": false, "status_code": <int>, "status_message": "<text>" }`. 404 → `NotFound`; 401 → bad/expired token (config/auth error — check `TMDB_API_KEY`); 422 → `InvalidParams`; 429 → `RateLimited` (honor `Retry-After`); 5xx → `ServiceUnavailable`. `httpErrorFromResponse` maps these. A 200 with an empty `results[]` is a valid empty result, not an error.

---

## Decisions Log

| Decision | Rationale |
|:---------|:----------|
| **Bearer auth, never `?api_key=`** | The provisioned `TMDB_API_KEY` is a v4 Read Access Token (JWT), not a v3 query key. TMDB v3 accepts the JWT via `Authorization: Bearer` (verified: OpenAPI `securitySchemes` = `apiKey in header name Authorization, x-bearer-format bearer`; docs state the Bearer token works across v3 and v4). The query-param path would 401. |
| **One service, not per-endpoint-group** | All endpoints share base URL, Bearer auth, retry config, rate limit, and the image/genre cache. Splitting adds nothing. |
| **Startup cache for `/configuration` + genre lists, in `setup()` (async)** | Both are needed on every response (image URLs, genre names) and change rarely. Fetching per-request would triple latency and call volume. `createApp`'s `setup` supports `async`/`Promise`, so the fetch fits the lifecycle cleanly. Failure aborts startup — no silent degradation, since the server cannot honor "full URLs" / "names not ids" without them. |
| **Full image URLs in output, raw paths never** | Hard requirement. `imageUrl()` resolves every `*_path`; returns `undefined` for null paths so the output field is omitted rather than carrying a broken URL. |
| **Genre names resolved server-side on every list response** | Discover/search/trending return only `genre_ids[]`. Resolving against the cached map per `media_type` gives the agent human-readable genres without an extra call or a second tool. |
| **Image sizes are NOT a tool input** | Sensible per-field defaults (`w500`/`w780`/`w185`/`w300`/`w92`) cover the agent/display use case. Exposing a size enum per image field would bloat every schema for a rare need; agents that want another size can rebuild the URL from the documented base. (Revisit only if a real use case appears.) |
| **`tmdb_get_watch_providers` is a standalone tool even though detail tools can append it** | Watch data is region-specific and the detail tools take no region. A standalone tool forces the region to be a conscious input, scopes the response to one country, and surfaces the TMDB `link`. Appending all-countries provider data to `get_movie` would be a large blob easily misread as global. |
| **Detail tools append credits/videos/recommendations/similar/keywords/external_ids + (release_dates\|content_ratings), but NOT watch/providers** | These collapse the common "tell me about this title" follow-ups into one HTTP call without a region dependency. `release_dates`/`content_ratings` supply the US certification. Watch/providers is excluded for the region reason above. |
| **`append` is an exposed, defaulted array on `get_movie`/`get_show`; fixed on `get_person`** | Movies/shows have a genuine "I only need cast" case worth a trim knob, and the default is the full set so the simple call is rich. A person dossier always wants `combined_credits` + `external_ids`, so exposing the knob there is needless surface. |
| **`mode` enum on `tmdb_search_titles` instead of four search tools** | `/search/{multi,movie,tv,person}` are the same workflow ("find a title/person") differing only by type filter. One tool with a `mode` enum tightens the surface and matches the openlibrary precedent (one search entry point). |
| **`media_type` parameter on discover/trending/watch-providers instead of per-type tools** | Same reasoning — `discover/movie` vs `discover/tv` are one workflow; the endpoint differs by a path segment. A `media_type` enum keeps the surface at 8 tools instead of 11+. |
| **`vote_count_gte` called out in prose as the quality gate** | The most common discover mistake is sorting by `vote_average.desc` and getting 10.0-from-2-votes noise. The parameter description names the fix explicitly so the agent reaches for it. |
| **Discover range params use dot notation in the API call, not snake_case** | TMDB's discover API uses `vote_count.gte`, `vote_average.gte`, `release_date.gte`, `with_runtime.gte` (dot notation). Using underscore variants (e.g. `vote_count_gte`) silently returns unfiltered results — verified live. The Zod input schema uses snake_case field names for JSON-Schema compatibility; the service layer translates them to the API's dot form. |
| **`with_cast`/`with_crew`/`with_networks` added to `tmdb_discover_titles`** | `with_crew` enables "movies directed by X" queries (director, writer, other crew). `with_networks` enables "TV shows on Netflix" queries. Both are real TMDB discover params confirmed live. `with_cast`/`with_crew` are movie-only; `with_networks` is TV-only — the tool accepts all params for both `media_type` values and no-ops inapplicable ones with a `ctx.enrich.notice`. Multi-value arrays are joined with `|` (OR) per TMDB semantics. |
| **`with_genres` array joined with `,` (AND); cast/crew/network/provider arrays joined with `|` (OR)** | TMDB discover uses comma for genre intersection (require all listed genres) and pipe for person/network/provider union (match any listed). Both tested live. The service layer performs this serialization. |
| **Region required (not defaulted) on `tmdb_get_watch_providers` and on discover's `with_watch_providers`** | "Where can I watch X" has no global answer. A silent default region would produce confidently-wrong availability for users elsewhere. The contract makes region a conscious choice; `region_required` is a typed error on discover. |
| **Empty results / empty provider region are valid responses, not errors** | "No titles matched" and "not streamable in this region" are real answers an agent must act on. They return normally with an `enrich.notice`, not a thrown error — a 404-style failure would hide the actual signal. |
| **Truncation fields optional; `totalCount` required via `ctx.enrich.total`** | TMDB pages at 20; list tools return the page as-is and disclose pagination via `totalCount` + `page`/`total_pages`. They don't slice a larger fetched set, so `truncated`/`shown`/`cap` are rarely populated — declaring them required would throw -32007 on every non-truncated result (the framework only writes them on an actual cap hit). |
| **Attribution in every tool's `enrichment`, not just the README** | TMDB's terms require the attribution string. Putting it in `enrichment.attribution` guarantees it reaches both client surfaces (`structuredContent` + `content[]`) on every call, satisfying the requirement programmatically rather than relying on the README a client may never read. |
| **Resources for movie/tv/person, mirroring the detail tools** | These three have stable integer ids and are worth injecting as context. Seasons are intermediate (reached from a show), discover/trending/search are query paths not addressable entities — no resources for them. All resource data is fully reachable via tools (tool-only clients lose nothing). |
| **Person credits ordered by recency (release year desc), not a synthetic relevance score** | An interpretable, honest ordering. TMDB's `combined_credits` has no authoritative per-person relevance ranking; fabricating one would be invented signal. Recency is transparent and useful. |
| **No DataCanvas** | Results are bounded metadata (20/page, capped detail arrays) and categorical, not analytical row sets an agent would SQL over. A discovery/search surface doesn't qualify for canvas on shape regardless of size. |
| **No prompts** | Pure data/lookup server with no recurring multi-step interaction template. The only candidate (watchlist analysis) is a deferred moonshot that would be a workflow tool, not a prompt. |

---

## Review pass

Independent design review against the live TMDB v3 API and the `design-mcp-server` skill bar. All claims below were verified by probing the provisioned Bearer token against production endpoints.

### What was changed

| # | Finding | Fix |
|:--|:--------|:----|
| 1 | **Discover range params must use dot notation, not snake_case.** TMDB's API requires `vote_count.gte`, `vote_average.gte`, `release_date.gte`, `with_runtime.gte` etc. Using underscore variants silently returns ALL results (unfiltered). Verified live: `vote_count.gte=100` returned 22,759 results; `vote_count_gte=100` returned 1,148,417 (unfiltered catalog). | Added an explicit **API param mapping** block under `tmdb_discover_titles` handler guards. The Zod schema keeps snake_case field names (JSON-Schema-safe); the service layer must translate to dot-form before building the query string. Also added to Decisions Log. |
| 2 | **`with_cast` silently ignored for TV, but `with_crew` and `with_networks` were missing entirely.** `with_crew` is a real discover-movie param (verified: 41 results for David Fincher). `with_networks` is a real discover-tv param (verified: 690 Netflix TV shows, `with_networks=213`). Both are genuine "find movies/shows by person/network" workflows. | Added `with_crew` and `with_networks` to the `tmdb_discover_titles` input schema with `.describe()`, handler guard notices for inapplicable `media_type`, decisions log entry, MCP Surface table row, and endpoint mapping note. |
| 3 | **Array join semantics undocumented.** `with_genres`/`without_genres` are `,`-joined (AND); `with_cast`/`with_crew`/`with_networks`/`with_watch_providers` are `|`-joined (OR). Without this, the service layer has no spec to implement against. | Documented in the new API param mapping block, in each affected `.describe()`, and in the Decisions Log. |
| 4 | **`series_id` is NOT returned by the season API endpoint.** The TMDB `/tv/{id}/season/{n}` response root fields are `_id, air_date, id, name, networks, overview, poster_path, season_number, vote_average` — no `series_id`. The design output listed `series_id` without noting this. | Added a parenthetical to the output spec ("echoed from input") and a note to the endpoint mapping table row. |
| 5 | **Season-level `credits` append is the regular cast, not guest stars.** Guest stars are embedded per-episode in the raw season response *without* any append (17 guest stars in BB S1 E1 confirmed). The season-level credits append gives a small recurring cast (6 for BB S1). The design description "guest stars are already in episode records" was correct but the append purpose was ambiguous. | Added a Note block under the season output spec clarifying the distinction: guest stars → episode objects (no append needed); regular cast → season-level credits append. |
| 6 | **`known_for` items in person search results are movie/TV records, not person records.** They have `poster_path`, NOT `profile_path`. The design output listed `{ id, media_type, title }` which was correct in omitting `profile_url`, but said nothing about `poster_url`. | Corrected the `known_for` description to `{ id, media_type, title, poster_url? }` with a note that these are media items (movie/tv), not person records. |
| 7 | **`imdb_id` is in the person root response, not only from `external_ids` append.** The design stated "imdb_id (optional, from external_ids)" which was misleading. `imdb_id` is present in the root `/person/{id}` response WITHOUT any append. The `external_ids` append adds the full social/platform id set (wikidata, facebook, instagram, tiktok, twitter, youtube). | Corrected the person output description to note `imdb_id` is in the root, and that `external_ids` provides the extended cross-platform id set. |
| 8 | **Certification extraction should prefer type-3 (theatrical) releases.** The live Fight Club data showed multiple US release_dates entries — some with empty `certification`, some with "R". Type 3 is the theatrical release and is the canonical cert. The design said "first non-empty certification" which usually works but would pick a non-theatrical cert if it appeared earlier in the array. | Updated the Workflow Analysis table row to specify: prefer type-3 theatrical entry; fallback to first non-empty. |
| 9 | **TV sort_by note corrected.** The design said `primary_release_date` "maps to first-air date" for TV, which is essentially accurate, but the note didn't explain why `first_air_date.desc` shouldn't be used directly. Live test showed `first_air_date.desc` returns shows with bogus future dates (2035–2043); `primary_release_date.desc` returns sensible recent dates. | Updated the `sort_by` describe text to explain the gotcha. |

### What was confirmed correct

- Bearer auth `Authorization: Bearer ${TMDB_API_KEY}` — confirmed live (401 on bad token; 200 on valid).
- Image base URL `https://image.tmdb.org/t/p/` from `secure_base_url` — confirmed via `/configuration`.
- All five `*_sizes` arrays present in `/configuration` response; all chosen defaults (`w500`, `w780`, `w185`, `w300`, `w92`) are valid members of their respective arrays.
- Genre lists (`/genre/movie/list` = 19 genres, `/genre/tv/list` = 16 genres) — shape confirmed.
- `append_to_response` on movie (`credits,videos,recommendations,similar,keywords,external_ids,release_dates`) — all namespaces present.
- `append_to_response` on TV (`credits,videos,recommendations,similar,keywords,external_ids,content_ratings`) — all namespaces present; `content_ratings.results[].rating` (not `certification`) for TV.
- `tmdb_get_watch_providers` output — `ads` and `free` types confirmed present (Breaking Bad TV); `link` and `buy`/`flatrate`/`rent` shape confirmed.
- `with_cast` for discover/movie — confirmed live (74 results for Edward Norton id=819).
- `with_cast` silently ignored for discover/tv — confirmed live (same total_results as no filter).
- Error envelope `{ success, status_code, status_message }` — confirmed on 404 and 401.
- `tmdb_search_titles` mode `multi` person results — `profile_path` present on person root, `known_for` is array of media items without `profile_path`.
- Truncation fields correctly optional; `totalCount` required via `ctx.enrich.total`. TMDB pages at 20 and the tools return a page as-is, so `ctx.enrich.truncated()` is not fired — no -32007 risk.
- Attribution string present in every tool's enrichment.
- Identity `tmdb-mcp-server` on all surfaces; `createApp` identity block is `name` + `title` only.
- No prompts; resources for movie/tv/person; no DataCanvas (categorical metadata, not analytical rows).
- MCP auth `none` is correct for a public read-only data server.

### What was not added (deliberate non-paddings)

- `tmdb_list_genres` — the genre maps are already surfaced as resolved names on every result; the Known Limitations note covers this. Not adding until a real use case appears.
- Season-level `crew` from the credits append — the key crew (writers, directors) is per-episode in the episode object's own `crew` array. Season-level credits cast is a small supplemental set. Noted in the review note but not added as separate output fields — implementation can decide how to surface both.
- `/person/{id}` filmography `known_for` credits in `tmdb_get_person` — `combined_credits` already covers the full filmography. The `known_for` field on the root person is a small TMDB-curated set, not needed alongside `cast_credits`/`crew_credits`.

**Review date:** 2026-06-13
