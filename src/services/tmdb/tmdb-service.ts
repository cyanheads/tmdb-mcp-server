/**
 * @fileoverview TMDB v3 REST client for tmdb-mcp-server. Single service wrapping
 * search, detail (movie/show/season/person), discover, trending, and watch-provider
 * endpoints. Authenticates with a Bearer token (v4 read-access JWT) — never the
 * `?api_key=` query param. Caches `/configuration` + genre maps at startup to
 * resolve image paths to full URLs and genre ids to names on every response.
 * @module services/tmdb/tmdb-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import { configurationError, JsonRpcErrorCode, notFound } from '@cyanheads/mcp-ts-core/errors';
import { fetchWithTimeout, type RequestContext, withRetry } from '@cyanheads/mcp-ts-core/utils';
import { getServerConfig } from '@/config/server-config.js';
import type {
  CastMember,
  CrewMember,
  DiscoverMediaType,
  Episode,
  EpisodeSummary,
  GenderLabel,
  MediaType,
  MovieDetail,
  Network,
  PaginatedSummary,
  PersonCastCredit,
  PersonCrewCredit,
  PersonDetail,
  Provider,
  RawCastMember,
  RawCombinedCredit,
  RawConfiguration,
  RawCrewMember,
  RawEpisodeSummary,
  RawExternalIds,
  RawGenreList,
  RawMovie,
  RawPaginatedResult,
  RawPerson,
  RawProvider,
  RawSeason,
  RawShow,
  RawSummaryItem,
  RawVideo,
  RawWatchProviders,
  SeasonDetail,
  SeasonSummary,
  ShowDetail,
  SummaryItem,
  Trailer,
  WatchProviders,
} from './types.js';

const BASE_URL = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 15_000;

/** Default image sizes per field — all valid members of the cached size arrays. */
const POSTER_SIZE = 'w500';
const BACKDROP_SIZE = 'w780';
const PROFILE_SIZE = 'w185';
const STILL_SIZE = 'w300';
const LOGO_SIZE = 'w92';

/** Display caps for the detail endpoints' capped arrays. */
const CAST_CAP = 15;
const CREDITS_CAP = 50;

/** Crew jobs surfaced in the curated `crew_key` set. */
const KEY_CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Story', 'Producer', 'Creator']);

/** Append sets fixed per endpoint. */
export type MovieAppend =
  | 'credits'
  | 'videos'
  | 'recommendations'
  | 'similar'
  | 'keywords'
  | 'external_ids'
  | 'release_dates';

export type ShowAppend =
  | 'credits'
  | 'videos'
  | 'recommendations'
  | 'similar'
  | 'keywords'
  | 'external_ids'
  | 'content_ratings';

/** Parsed discover filters (snake_case from the tool schema). */
export interface DiscoverParams {
  include_adult: boolean;
  media_type: DiscoverMediaType;
  page: number;
  release_date_gte?: string;
  release_date_lte?: string;
  runtime_gte?: number;
  runtime_lte?: number;
  sort_by: string;
  vote_average_gte?: number;
  vote_average_lte?: number;
  vote_count_gte?: number;
  watch_region?: string;
  with_cast?: number[];
  with_crew?: number[];
  with_genres?: number[];
  with_networks?: number[];
  with_original_language?: string;
  with_watch_providers?: number[];
  without_genres?: number[];
  year?: number;
}

const GENDER_LABELS: Record<number, GenderLabel> = {
  0: 'unknown',
  1: 'female',
  2: 'male',
  3: 'non-binary',
};

export class TmdbService {
  private readonly token: string;
  private readonly defaultLanguage: string;

  /** Image base URL from `/configuration` (`secure_base_url`). Set in `init()`. */
  private secureBaseUrl = '';
  private movieGenres: Map<number, string> = new Map();
  private tvGenres: Map<number, string> = new Map();

  constructor(token: string, defaultLanguage = 'en-US') {
    this.token = token;
    this.defaultLanguage = defaultLanguage;
  }

  /* ──────────────────────────── HTTP core ──────────────────────────────── */

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
  }

  /**
   * GET `path` (relative to the base URL) with Bearer auth, retry, timeout, and
   * an HTML-error guard. `fetchWithTimeout` throws a status-mapped `McpError` on
   * any non-2xx response (401→Unauthorized, 404→NotFound, 429→RateLimited,
   * 5xx→ServiceUnavailable), so the caller doesn't re-check `response.ok`.
   */
  private fetch<T>(path: string, ctx: Context | RequestContext, qs?: URLSearchParams): Promise<T> {
    const url = qs && qs.size > 0 ? `${BASE_URL}${path}?${qs.toString()}` : `${BASE_URL}${path}`;
    /**
     * `fetchWithTimeout`/`withRetry` accept `RequestContext` (index-signature
     * shape). A handler `Context` is structurally compatible at runtime — cast
     * is safe per framework docs. `signal` is only present on a handler Context.
     */
    // biome-ignore lint/suspicious/noExplicitAny: RequestContext compatibility, safe per framework docs
    const rCtx = ctx as any;
    const signal: AbortSignal | undefined = 'signal' in ctx ? (ctx as Context).signal : undefined;
    return withRetry(
      async () => {
        const response = await fetchWithTimeout(url, TIMEOUT_MS, rCtx, {
          headers: this.headers(),
          ...(signal ? { signal } : {}),
        });
        const text = await response.text();
        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw new Error('Service unavailable — TMDB returned HTML instead of JSON.');
        }
        return JSON.parse(text) as T;
      },
      {
        operation: 'Tmdb.fetch',
        context: rCtx,
        baseDelayMs: 500,
        ...(signal ? { signal } : {}),
      },
    );
  }

  /* ──────────────────────────── Startup cache ──────────────────────────── */

  /**
   * Fetches `/configuration` and both genre lists in parallel and builds the
   * image base + genre maps. Called once from `createApp({ setup })`. Any failure
   * aborts startup loudly — without these the server cannot honor "full URLs,
   * never raw paths" or "names, never bare ids".
   */
  async init(ctx: RequestContext): Promise<void> {
    const [config, movieGenres, tvGenres] = await Promise.all([
      this.fetch<RawConfiguration>('/configuration', ctx),
      this.fetch<RawGenreList>('/genre/movie/list', ctx),
      this.fetch<RawGenreList>('/genre/tv/list', ctx),
    ]);

    const base = config.images?.secure_base_url ?? config.images?.base_url;
    if (!base) {
      throw configurationError(
        'TMDB /configuration did not return an image base URL — cannot resolve image paths.',
      );
    }
    this.secureBaseUrl = base;
    this.movieGenres = new Map((movieGenres.genres ?? []).map((g) => [g.id, g.name]));
    this.tvGenres = new Map((tvGenres.genres ?? []).map((g) => [g.id, g.name]));
  }

  /* ──────────────────────────── Pure helpers ───────────────────────────── */

  /** Resolves a TMDB `*_path` to a full URL, or `undefined` when the path is null/absent. */
  private imageUrl(path: string | null | undefined, size: string): string | undefined {
    if (!path) return;
    return `${this.secureBaseUrl}${size}${path}`;
  }

  /**
   * Resolves a `*_path` and returns a spreadable `{ [key]: url }` when present, or
   * `{}` when absent. Narrows the value to `string` so it satisfies
   * `exactOptionalPropertyTypes` targets that omit `| undefined`.
   */
  private urlField<K extends string>(
    key: K,
    path: string | null | undefined,
    size: string,
  ): Record<K, string> | Record<string, never> {
    const url = this.imageUrl(path, size);
    return url ? ({ [key]: url } as Record<K, string>) : {};
  }

  /** Maps genre ids to names via the cached map for `kind`; unknown ids are dropped. */
  private genreNames(ids: number[] | undefined, kind: DiscoverMediaType): string[] {
    if (!ids?.length) return [];
    const map = kind === 'movie' ? this.movieGenres : this.tvGenres;
    const names: string[] = [];
    for (const id of ids) {
      const name = map.get(id);
      if (name) names.push(name);
    }
    return names;
  }

  /** Extracts a 4-digit year from a TMDB date string (`YYYY-MM-DD`). */
  private year(date: string | undefined): number | undefined {
    if (!date) return;
    const y = Number.parseInt(date.slice(0, 4), 10);
    return Number.isFinite(y) ? y : undefined;
  }

  private castMember(raw: RawCastMember): CastMember {
    return {
      id: raw.id,
      name: raw.name ?? '',
      ...(raw.character ? { character: raw.character } : {}),
      ...(typeof raw.order === 'number' ? { order: raw.order } : {}),
      ...this.urlField('profile_url', raw.profile_path, PROFILE_SIZE),
    };
  }

  private crewMember(raw: RawCrewMember): CrewMember {
    return {
      id: raw.id,
      name: raw.name ?? '',
      job: raw.job ?? '',
      ...(raw.department ? { department: raw.department } : {}),
      ...this.urlField('profile_url', raw.profile_path, PROFILE_SIZE),
    };
  }

  private trailers(videos: RawVideo[] | undefined): Trailer[] {
    return (videos ?? [])
      .filter((v) => v.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser'))
      .map((v) => ({
        name: v.name ?? '',
        key: v.key as string,
        url: `https://www.youtube.com/watch?v=${v.key}`,
        ...(v.type ? { type: v.type } : {}),
        site: v.site as string,
      }));
  }

  /** Resolves a summary card; `kind` selects the genre namespace for `genre_ids`. */
  private summaryItem(raw: RawSummaryItem, kind: DiscoverMediaType): SummaryItem {
    const mediaType: MediaType = raw.media_type ?? (kind === 'tv' ? 'tv' : 'movie');
    const title = raw.title ?? raw.name ?? '';
    const date = raw.release_date ?? raw.first_air_date;
    const releaseYear = this.year(date);
    const isPerson = mediaType === 'person';
    const genreKind: DiscoverMediaType = mediaType === 'tv' ? 'tv' : 'movie';
    return {
      id: raw.id,
      media_type: mediaType,
      title,
      ...(releaseYear !== undefined ? { release_year: releaseYear } : {}),
      ...(raw.overview ? { overview: raw.overview } : {}),
      ...(typeof raw.vote_average === 'number' ? { vote_average: raw.vote_average } : {}),
      ...(typeof raw.vote_count === 'number' ? { vote_count: raw.vote_count } : {}),
      ...(typeof raw.popularity === 'number' ? { popularity: raw.popularity } : {}),
      ...(!isPerson && raw.genre_ids?.length
        ? { genre_names: this.genreNames(raw.genre_ids, genreKind) }
        : {}),
      ...this.urlField('poster_url', raw.poster_path, POSTER_SIZE),
      ...(isPerson ? this.urlField('profile_url', raw.profile_path, PROFILE_SIZE) : {}),
      ...(raw.known_for_department ? { known_for_department: raw.known_for_department } : {}),
      ...(isPerson && raw.known_for?.length
        ? {
            known_for: raw.known_for.map((k) => ({
              id: k.id,
              media_type: (k.media_type ?? 'movie') as MediaType,
              title: k.title ?? k.name ?? '',
              ...this.urlField('poster_url', k.poster_path, POSTER_SIZE),
            })),
          }
        : {}),
    };
  }

  /** Builds a spreadable `{ external_ids }` from the raw set, or `{}` when empty. */
  private externalIdsField(
    raw: RawExternalIds | undefined,
  ): { external_ids: Record<string, string> } | Record<string, never> {
    if (!raw) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string' && value.length > 0) out[key] = value;
    }
    return Object.keys(out).length > 0 ? { external_ids: out } : {};
  }

  private provider(raw: RawProvider): Provider {
    return {
      provider_id: raw.provider_id,
      provider_name: raw.provider_name ?? '',
      ...this.urlField('logo_url', raw.logo_path, LOGO_SIZE),
      display_priority: raw.display_priority ?? 0,
    };
  }

  /* ──────────────────────────── Search ─────────────────────────────────── */

  async search(
    params: {
      query: string;
      mode: 'multi' | 'movie' | 'tv' | 'person';
      year?: number;
      language?: string;
      include_adult: boolean;
      page: number;
    },
    ctx: Context,
  ): Promise<PaginatedSummary> {
    const qs = new URLSearchParams({
      query: params.query,
      include_adult: String(params.include_adult),
      page: String(params.page),
      language: params.language ?? this.defaultLanguage,
    });
    if (params.year !== undefined && (params.mode === 'movie' || params.mode === 'tv')) {
      qs.set(params.mode === 'movie' ? 'year' : 'first_air_date_year', String(params.year));
    }

    const raw = await this.fetch<RawPaginatedResult>(`/search/${params.mode}`, ctx, qs);
    const kind: DiscoverMediaType = params.mode === 'tv' ? 'tv' : 'movie';
    // Typed search (movie/tv/person) returns homogeneous results without media_type;
    // multi-mode items carry their own. Fallback only for the typed modes.
    const fallback: MediaType | undefined = params.mode === 'multi' ? undefined : params.mode;
    return this.paginated(raw, kind, fallback);
  }

  /* ──────────────────────────── Movie detail ───────────────────────────── */

  async getMovie(
    movieId: number,
    append: MovieAppend[],
    ctx: Context,
    language?: string,
  ): Promise<MovieDetail> {
    const qs = new URLSearchParams({ language: language ?? this.defaultLanguage });
    if (append.length > 0) qs.set('append_to_response', append.join(','));
    const raw = await this.fetchDetail<RawMovie>(`/movie/${movieId}`, ctx, qs, 'movie', movieId);
    return this.normalizeMovie(raw, append);
  }

  private normalizeMovie(raw: RawMovie, append: MovieAppend[]): MovieDetail {
    const has = (k: MovieAppend) => append.includes(k);
    const crewKey = (raw.credits?.crew ?? [])
      .filter((c) => c.job && KEY_CREW_JOBS.has(c.job))
      .map((c) => this.crewMember(c));

    return {
      id: raw.id,
      title: raw.title ?? '',
      ...(raw.original_title ? { original_title: raw.original_title } : {}),
      ...(raw.tagline ? { tagline: raw.tagline } : {}),
      ...(raw.overview ? { overview: raw.overview } : {}),
      ...(raw.status ? { status: raw.status } : {}),
      ...(raw.release_date ? { release_date: raw.release_date } : {}),
      ...(typeof raw.runtime === 'number' ? { runtime_minutes: raw.runtime } : {}),
      genres: (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
      vote_average: raw.vote_average ?? 0,
      vote_count: raw.vote_count ?? 0,
      popularity: raw.popularity ?? 0,
      ...(typeof raw.budget === 'number' && raw.budget > 0 ? { budget: raw.budget } : {}),
      ...(typeof raw.revenue === 'number' && raw.revenue > 0 ? { revenue: raw.revenue } : {}),
      ...(raw.homepage ? { homepage: raw.homepage } : {}),
      ...(raw.imdb_id ? { imdb_id: raw.imdb_id } : {}),
      ...(() => {
        const cert = has('release_dates') ? this.usCertification(raw) : undefined;
        return cert ? { us_certification: cert } : {};
      })(),
      ...this.urlField('poster_url', raw.poster_path, POSTER_SIZE),
      ...this.urlField('backdrop_url', raw.backdrop_path, BACKDROP_SIZE),
      ...(has('credits') && raw.credits?.cast
        ? { cast: raw.credits.cast.slice(0, CAST_CAP).map((c) => this.castMember(c)) }
        : {}),
      ...(has('credits') && crewKey.length > 0 ? { crew_key: crewKey } : {}),
      ...(has('videos') ? { trailers: this.trailers(raw.videos?.results) } : {}),
      ...(has('recommendations') && raw.recommendations?.results
        ? { recommendations: raw.recommendations.results.map((r) => this.summaryItem(r, 'movie')) }
        : {}),
      ...(has('similar') && raw.similar?.results
        ? { similar: raw.similar.results.map((r) => this.summaryItem(r, 'movie')) }
        : {}),
      ...(has('keywords') && raw.keywords?.keywords
        ? { keywords: raw.keywords.keywords.map((k) => ({ id: k.id, name: k.name })) }
        : {}),
      ...(has('external_ids') ? this.externalIdsField(raw.external_ids) : {}),
    };
  }

  /** Extracts the US certification, preferring the type-3 (theatrical) release. */
  private usCertification(raw: RawMovie): string | undefined {
    const us = raw.release_dates?.results?.find((r) => r.iso_3166_1 === 'US');
    if (!us?.release_dates?.length) return;
    const theatrical = us.release_dates.find((d) => d.type === 3 && d.certification);
    if (theatrical?.certification) return theatrical.certification;
    const firstNonEmpty = us.release_dates.find((d) => d.certification);
    return firstNonEmpty?.certification ?? undefined;
  }

  /* ──────────────────────────── Show detail ────────────────────────────── */

  async getShow(
    seriesId: number,
    append: ShowAppend[],
    ctx: Context,
    language?: string,
  ): Promise<ShowDetail> {
    const qs = new URLSearchParams({ language: language ?? this.defaultLanguage });
    if (append.length > 0) qs.set('append_to_response', append.join(','));
    const raw = await this.fetchDetail<RawShow>(`/tv/${seriesId}`, ctx, qs, 'show', seriesId);
    return this.normalizeShow(raw, append);
  }

  private episodeSummary(raw: RawEpisodeSummary): EpisodeSummary {
    return {
      ...(typeof raw.id === 'number' ? { id: raw.id } : {}),
      name: raw.name ?? '',
      ...(raw.overview ? { overview: raw.overview } : {}),
      ...(raw.air_date ? { air_date: raw.air_date } : {}),
      ...(typeof raw.episode_number === 'number' ? { episode_number: raw.episode_number } : {}),
      ...(typeof raw.season_number === 'number' ? { season_number: raw.season_number } : {}),
      ...(typeof raw.vote_average === 'number' ? { vote_average: raw.vote_average } : {}),
      ...this.urlField('still_url', raw.still_path, STILL_SIZE),
    };
  }

  private normalizeShow(raw: RawShow, append: ShowAppend[]): ShowDetail {
    const has = (k: ShowAppend) => append.includes(k);
    const crewKey = (raw.credits?.crew ?? [])
      .filter((c) => c.job && KEY_CREW_JOBS.has(c.job))
      .map((c) => this.crewMember(c));
    const networks: Network[] = (raw.networks ?? []).map((n) => ({
      id: n.id,
      name: n.name ?? '',
      ...this.urlField('logo_url', n.logo_path, LOGO_SIZE),
      ...(n.origin_country ? { origin_country: n.origin_country } : {}),
    }));
    const seasons: SeasonSummary[] = (raw.seasons ?? []).map((s) => ({
      season_number: s.season_number ?? 0,
      name: s.name ?? '',
      episode_count: s.episode_count ?? 0,
      ...(s.air_date ? { air_date: s.air_date } : {}),
      ...(s.overview ? { overview: s.overview } : {}),
      ...this.urlField('poster_url', s.poster_path, POSTER_SIZE),
    }));
    const createdBy: CastMember[] = (raw.created_by ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? '',
      ...this.urlField('profile_url', c.profile_path, PROFILE_SIZE),
    }));

    return {
      id: raw.id,
      name: raw.name ?? '',
      ...(raw.original_name ? { original_name: raw.original_name } : {}),
      ...(raw.tagline ? { tagline: raw.tagline } : {}),
      ...(raw.overview ? { overview: raw.overview } : {}),
      ...(raw.status ? { status: raw.status } : {}),
      ...(raw.first_air_date ? { first_air_date: raw.first_air_date } : {}),
      ...(raw.last_air_date ? { last_air_date: raw.last_air_date } : {}),
      number_of_seasons: raw.number_of_seasons ?? 0,
      number_of_episodes: raw.number_of_episodes ?? 0,
      ...(raw.episode_run_time?.length ? { episode_run_time: raw.episode_run_time } : {}),
      genres: (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
      vote_average: raw.vote_average ?? 0,
      vote_count: raw.vote_count ?? 0,
      popularity: raw.popularity ?? 0,
      ...(raw.homepage ? { homepage: raw.homepage } : {}),
      in_production: raw.in_production ?? false,
      ...(raw.type ? { type: raw.type } : {}),
      ...(() => {
        const rating = has('content_ratings') ? this.usContentRating(raw) : undefined;
        return rating ? { us_content_rating: rating } : {};
      })(),
      ...this.urlField('poster_url', raw.poster_path, POSTER_SIZE),
      ...this.urlField('backdrop_url', raw.backdrop_path, BACKDROP_SIZE),
      ...(createdBy.length > 0 ? { created_by: createdBy } : {}),
      ...(networks.length > 0 ? { networks } : {}),
      seasons,
      ...(raw.last_episode_to_air
        ? { last_episode_to_air: this.episodeSummary(raw.last_episode_to_air) }
        : {}),
      ...(raw.next_episode_to_air
        ? { next_episode_to_air: this.episodeSummary(raw.next_episode_to_air) }
        : {}),
      ...(has('credits') && raw.credits?.cast
        ? { cast: raw.credits.cast.slice(0, CAST_CAP).map((c) => this.castMember(c)) }
        : {}),
      ...(has('credits') && crewKey.length > 0 ? { crew_key: crewKey } : {}),
      ...(has('videos') ? { trailers: this.trailers(raw.videos?.results) } : {}),
      ...(has('recommendations') && raw.recommendations?.results
        ? { recommendations: raw.recommendations.results.map((r) => this.summaryItem(r, 'tv')) }
        : {}),
      ...(has('similar') && raw.similar?.results
        ? { similar: raw.similar.results.map((r) => this.summaryItem(r, 'tv')) }
        : {}),
      ...(has('keywords') && raw.keywords?.results
        ? { keywords: raw.keywords.results.map((k) => ({ id: k.id, name: k.name })) }
        : {}),
      ...(has('external_ids') ? this.externalIdsField(raw.external_ids) : {}),
    };
  }

  /** Extracts the US content rating from the `content_ratings` namespace. */
  private usContentRating(raw: RawShow): string | undefined {
    const us = raw.content_ratings?.results?.find((r) => r.iso_3166_1 === 'US');
    return us?.rating || undefined;
  }

  /* ──────────────────────────── Season ─────────────────────────────────── */

  async getSeason(
    seriesId: number,
    seasonNumber: number,
    ctx: Context,
    language?: string,
  ): Promise<SeasonDetail> {
    const qs = new URLSearchParams({
      language: language ?? this.defaultLanguage,
      append_to_response: 'credits',
    });
    const raw = await this.fetchDetail<RawSeason>(
      `/tv/${seriesId}/season/${seasonNumber}`,
      ctx,
      qs,
      'season',
      seriesId,
    );

    const episodes: Episode[] = (raw.episodes ?? []).map((e) => ({
      episode_number: e.episode_number,
      name: e.name ?? '',
      ...(e.overview ? { overview: e.overview } : {}),
      ...(e.air_date ? { air_date: e.air_date } : {}),
      ...(typeof e.runtime === 'number' ? { runtime_minutes: e.runtime } : {}),
      ...(typeof e.vote_average === 'number' ? { vote_average: e.vote_average } : {}),
      ...this.urlField('still_url', e.still_path, STILL_SIZE),
      ...(e.guest_stars?.length
        ? { guest_stars: e.guest_stars.map((g) => this.castMember(g)) }
        : {}),
    }));

    const regularCast = (raw.credits?.cast ?? []).map((c) => this.castMember(c));

    return {
      series_id: seriesId, // echoed — the season endpoint does not return it
      season_number: raw.season_number ?? seasonNumber,
      name: raw.name ?? '',
      ...(raw.overview ? { overview: raw.overview } : {}),
      ...(raw.air_date ? { air_date: raw.air_date } : {}),
      ...(typeof raw.vote_average === 'number' ? { vote_average: raw.vote_average } : {}),
      ...this.urlField('poster_url', raw.poster_path, POSTER_SIZE),
      ...(regularCast.length > 0 ? { regular_cast: regularCast } : {}),
      episodes,
    };
  }

  /* ──────────────────────────── Person ─────────────────────────────────── */

  async getPerson(personId: number, ctx: Context, language?: string): Promise<PersonDetail> {
    const qs = new URLSearchParams({
      language: language ?? this.defaultLanguage,
      append_to_response: 'combined_credits,external_ids',
    });
    const raw = await this.fetchDetail<RawPerson>(
      `/person/${personId}`,
      ctx,
      qs,
      'person',
      personId,
    );
    return this.normalizePerson(raw);
  }

  private normalizePerson(raw: RawPerson): PersonDetail {
    const castRaw = raw.combined_credits?.cast ?? [];
    const crewRaw = raw.combined_credits?.crew ?? [];

    const castSorted = [...castRaw].sort((a, b) => this.creditYear(b) - this.creditYear(a));
    const crewSorted = [...crewRaw].sort((a, b) => this.creditYear(b) - this.creditYear(a));

    const cast_credits: PersonCastCredit[] = castSorted.slice(0, CREDITS_CAP).map((c) => {
      const releaseYear = this.year(c.release_date ?? c.first_air_date);
      return {
        id: c.id,
        media_type: (c.media_type ?? 'movie') as MediaType,
        title: c.title ?? c.name ?? '',
        ...(c.character ? { character: c.character } : {}),
        ...(releaseYear !== undefined ? { release_year: releaseYear } : {}),
        ...(typeof c.vote_average === 'number' ? { vote_average: c.vote_average } : {}),
        ...this.urlField('poster_url', c.poster_path, POSTER_SIZE),
      };
    });

    const crew_credits: PersonCrewCredit[] = crewSorted.slice(0, CREDITS_CAP).map((c) => {
      const releaseYear = this.year(c.release_date ?? c.first_air_date);
      return {
        id: c.id,
        media_type: (c.media_type ?? 'movie') as MediaType,
        title: c.title ?? c.name ?? '',
        job: c.job ?? '',
        ...(c.department ? { department: c.department } : {}),
        ...(releaseYear !== undefined ? { release_year: releaseYear } : {}),
        ...this.urlField('poster_url', c.poster_path, POSTER_SIZE),
      };
    });

    return {
      id: raw.id,
      name: raw.name ?? '',
      ...(raw.biography ? { biography: raw.biography } : {}),
      ...(raw.birthday ? { birthday: raw.birthday } : {}),
      ...(raw.deathday ? { deathday: raw.deathday } : {}),
      ...(raw.place_of_birth ? { place_of_birth: raw.place_of_birth } : {}),
      ...(raw.known_for_department ? { known_for_department: raw.known_for_department } : {}),
      ...(raw.also_known_as?.length ? { also_known_as: raw.also_known_as } : {}),
      ...(typeof raw.gender === 'number' && GENDER_LABELS[raw.gender]
        ? { gender: GENDER_LABELS[raw.gender] }
        : {}),
      popularity: raw.popularity ?? 0,
      ...(raw.homepage ? { homepage: raw.homepage } : {}),
      ...(raw.imdb_id ? { imdb_id: raw.imdb_id } : {}),
      ...this.urlField('profile_url', raw.profile_path, PROFILE_SIZE),
      cast_credits,
      crew_credits,
      ...this.externalIdsField(raw.external_ids),
      cast_credits_total: castRaw.length,
      crew_credits_total: crewRaw.length,
    };
  }

  private creditYear(c: RawCombinedCredit): number {
    return this.year(c.release_date ?? c.first_air_date) ?? 0;
  }

  /* ──────────────────────────── Discover ───────────────────────────────── */

  async discover(
    params: DiscoverParams,
    ctx: Context,
    language?: string,
  ): Promise<PaginatedSummary> {
    const qs = new URLSearchParams({
      sort_by: params.sort_by,
      include_adult: String(params.include_adult),
      page: String(params.page),
      language: language ?? this.defaultLanguage,
    });

    if (params.with_genres?.length) qs.set('with_genres', params.with_genres.join(','));
    if (params.without_genres?.length) qs.set('without_genres', params.without_genres.join(','));
    if (params.year !== undefined) {
      qs.set(
        params.media_type === 'movie' ? 'primary_release_year' : 'first_air_date_year',
        String(params.year),
      );
    }
    // Dot-notation range params — snake_case variants silently return ALL results.
    if (params.release_date_gte) {
      qs.set(
        params.media_type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte',
        params.release_date_gte,
      );
    }
    if (params.release_date_lte) {
      qs.set(
        params.media_type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte',
        params.release_date_lte,
      );
    }
    if (params.vote_average_gte !== undefined)
      qs.set('vote_average.gte', String(params.vote_average_gte));
    if (params.vote_average_lte !== undefined)
      qs.set('vote_average.lte', String(params.vote_average_lte));
    if (params.vote_count_gte !== undefined)
      qs.set('vote_count.gte', String(params.vote_count_gte));
    if (params.runtime_gte !== undefined) qs.set('with_runtime.gte', String(params.runtime_gte));
    if (params.runtime_lte !== undefined) qs.set('with_runtime.lte', String(params.runtime_lte));
    if (params.with_original_language)
      qs.set('with_original_language', params.with_original_language);

    // OR-joined (pipe) — only meaningful for the applicable media_type.
    if (params.media_type === 'movie') {
      if (params.with_cast?.length) qs.set('with_cast', params.with_cast.join('|'));
      if (params.with_crew?.length) qs.set('with_crew', params.with_crew.join('|'));
    }
    if (params.media_type === 'tv' && params.with_networks?.length) {
      qs.set('with_networks', params.with_networks.join('|'));
    }
    if (params.with_watch_providers?.length && params.watch_region) {
      qs.set('with_watch_providers', params.with_watch_providers.join('|'));
      qs.set('watch_region', params.watch_region);
    }

    const raw = await this.fetch<RawPaginatedResult>(`/discover/${params.media_type}`, ctx, qs);
    return this.paginated(raw, params.media_type, params.media_type);
  }

  /* ──────────────────────────── Trending ───────────────────────────────── */

  async getTrending(
    params: {
      media_type: 'all' | 'movie' | 'tv' | 'person';
      time_window: 'day' | 'week';
      language?: string;
      page: number;
    },
    ctx: Context,
  ): Promise<PaginatedSummary> {
    const qs = new URLSearchParams({
      page: String(params.page),
      language: params.language ?? this.defaultLanguage,
    });
    const raw = await this.fetch<RawPaginatedResult>(
      `/trending/${params.media_type}/${params.time_window}`,
      ctx,
      qs,
    );
    // Trending/all is mixed — each item carries media_type; fall back to movie for genre namespace.
    const kind: DiscoverMediaType = params.media_type === 'tv' ? 'tv' : 'movie';
    const fallbackMedia = params.media_type === 'all' ? undefined : params.media_type;
    return this.paginated(raw, kind, fallbackMedia);
  }

  /* ──────────────────────────── Watch providers ────────────────────────── */

  async getWatchProviders(
    mediaType: DiscoverMediaType,
    id: number,
    watchRegion: string,
    ctx: Context,
  ): Promise<WatchProviders> {
    const raw = await this.fetchDetail<RawWatchProviders>(
      `/${mediaType}/${id}/watch/providers`,
      ctx,
      new URLSearchParams(),
      'title',
      id,
    );

    const region = raw.results?.[watchRegion];
    return {
      id,
      media_type: mediaType,
      region: watchRegion,
      ...(region?.link ? { link: region.link } : {}),
      flatrate: (region?.flatrate ?? []).map((p) => this.provider(p)),
      rent: (region?.rent ?? []).map((p) => this.provider(p)),
      buy: (region?.buy ?? []).map((p) => this.provider(p)),
      ads: (region?.ads ?? []).map((p) => this.provider(p)),
      free: (region?.free ?? []).map((p) => this.provider(p)),
    };
  }

  /* ──────────────────────────── Internal shared ────────────────────────── */

  private paginated(
    raw: RawPaginatedResult,
    kind: DiscoverMediaType,
    fallbackMedia: MediaType | undefined,
  ): PaginatedSummary {
    return {
      page: raw.page ?? 1,
      total_pages: raw.total_pages ?? 0,
      total_results: raw.total_results ?? 0,
      results: (raw.results ?? []).map((r) => {
        const withMedia: RawSummaryItem =
          r.media_type || !fallbackMedia ? r : { ...r, media_type: fallbackMedia };
        return this.summaryItem(withMedia, kind);
      }),
    };
  }

  /**
   * Detail fetch that maps a 404 (the only resource-not-found signal TMDB gives
   * for a bad id) to the caller's typed `not_found` reason. Other status codes
   * bubble from `fetchWithTimeout` as classified `McpError`s.
   */
  private async fetchDetail<T>(
    path: string,
    ctx: Context,
    qs: URLSearchParams,
    kind: 'movie' | 'show' | 'season' | 'person' | 'title',
    id: number,
  ): Promise<T> {
    try {
      return await this.fetch<T>(path, ctx, qs);
    } catch (err) {
      if (isNotFound(err)) {
        throw notFound(notFoundMessage(kind, id), {
          reason: `${kind}_not_found`,
          id,
          recovery: { hint: notFoundRecovery(kind) },
        });
      }
      throw err;
    }
  }
}

/* ──────────────────────────── Error helpers ────────────────────────────── */

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === JsonRpcErrorCode.NotFound
  );
}

function notFoundMessage(
  kind: 'movie' | 'show' | 'season' | 'person' | 'title',
  id: number,
): string {
  switch (kind) {
    case 'movie':
      return `No TMDB movie found for id ${id}.`;
    case 'show':
      return `No TMDB TV show found for id ${id}.`;
    case 'season':
      return `No TMDB season found — series id ${id} is wrong or the season number does not exist.`;
    case 'person':
      return `No TMDB person found for id ${id}.`;
    case 'title':
      return `No TMDB title found for id ${id} — verify the id and that media_type matches it.`;
  }
}

/**
 * Recovery hint attached to the not-found `data.recovery.hint` so it reaches both
 * client surfaces. Mirrors each tool/resource `errors[]` contract's `recovery`
 * string — the contract is the source of truth; this keeps the wire in sync.
 */
function notFoundRecovery(kind: 'movie' | 'show' | 'season' | 'person' | 'title'): string {
  switch (kind) {
    case 'movie':
      return 'Verify the id with tmdb_search_titles (mode "movie") — TMDB keys on integer ids, not titles.';
    case 'show':
      return 'Verify the id with tmdb_search_titles (mode "tv") — TMDB keys on integer ids, not titles.';
    case 'season':
      return 'Confirm the series id and list valid season numbers with tmdb_get_show (seasons[].season_number) before retrying.';
    case 'person':
      return 'Verify the id with tmdb_search_titles (mode "person").';
    case 'title':
      return 'Verify the id and that media_type matches it (a movie id is not a tv id) via tmdb_search_titles.';
  }
}

/* ──────────────────────────── Init / accessor ──────────────────────────── */

let _service: TmdbService | undefined;

/** Constructs the service from config. The `/configuration` + genre fetch happens in `init()`. */
export function initTmdbService(): TmdbService {
  const { apiKey, language } = getServerConfig();
  _service = new TmdbService(apiKey, language);
  return _service;
}

export function getTmdbService(): TmdbService {
  if (!_service) {
    throw new Error('TmdbService not initialized — call initTmdbService() in setup()');
  }
  return _service;
}

/** Test-only reset of the singleton. */
export function resetTmdbService(): void {
  _service = undefined;
}
