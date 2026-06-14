/**
 * @fileoverview Raw TMDB v3 response shapes and normalized domain types for
 * tmdb-mcp-server. Raw types default to optional unless presence is guaranteed
 * (TMDB omits fields and returns null paths frequently); domain types mirror the
 * tool output schemas. Image `*_path` fields are resolved to full URLs and genre
 * ids resolved to names before leaving the service.
 * @module services/tmdb/types
 */

/* ─────────────────────────── Shared media type ─────────────────────────── */

export type MediaType = 'movie' | 'tv' | 'person';
export type DiscoverMediaType = 'movie' | 'tv';

/* ─────────────────────────── Startup cache ─────────────────────────────── */

/** Raw `/configuration` response (image base + size arrays). */
export interface RawConfiguration {
  images?: {
    base_url?: string;
    secure_base_url?: string;
    poster_sizes?: string[];
    backdrop_sizes?: string[];
    profile_sizes?: string[];
    still_sizes?: string[];
    logo_sizes?: string[];
  };
}

/** Raw `/genre/{movie,tv}/list` response. */
export interface RawGenreList {
  genres?: Array<{ id: number; name: string }>;
}

/* ─────────────────────────── Raw building blocks ───────────────────────── */

export interface RawGenre {
  id: number;
  name: string;
}

export interface RawCastMember {
  character?: string;
  id: number;
  name?: string;
  order?: number;
  profile_path?: string | null;
}

export interface RawCrewMember {
  department?: string;
  id: number;
  job?: string;
  name?: string;
  profile_path?: string | null;
}

export interface RawVideo {
  id?: string;
  key?: string;
  name?: string;
  site?: string;
  type?: string;
}

export interface RawKeyword {
  id: number;
  name: string;
}

/** A summary card as returned in search/discover/trending/recommendations/similar. */
export interface RawSummaryItem {
  first_air_date?: string;
  genre_ids?: number[];
  id: number;
  known_for?: RawSummaryItem[];
  known_for_department?: string;
  media_type?: MediaType;
  name?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  profile_path?: string | null;
  release_date?: string;
  title?: string;
  vote_average?: number;
  vote_count?: number;
}

export interface RawExternalIds {
  facebook_id?: string | null;
  imdb_id?: string | null;
  instagram_id?: string | null;
  tiktok_id?: string | null;
  twitter_id?: string | null;
  wikidata_id?: string | null;
  youtube_id?: string | null;
}

/* ─────────────────────────── Raw movie ─────────────────────────────────── */

export interface RawMovie {
  backdrop_path?: string | null;
  budget?: number;
  credits?: { cast?: RawCastMember[]; crew?: RawCrewMember[] };
  external_ids?: RawExternalIds;
  genres?: RawGenre[];
  homepage?: string | null;
  id: number;
  imdb_id?: string | null;
  keywords?: { keywords?: RawKeyword[] };
  original_title?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  recommendations?: { results?: RawSummaryItem[] };
  release_date?: string;
  release_dates?: {
    results?: Array<{
      iso_3166_1?: string;
      release_dates?: Array<{ certification?: string; type?: number }>;
    }>;
  };
  revenue?: number;
  runtime?: number | null;
  similar?: { results?: RawSummaryItem[] };
  status?: string;
  tagline?: string;
  title?: string;
  videos?: { results?: RawVideo[] };
  vote_average?: number;
  vote_count?: number;
}

/* ─────────────────────────── Raw TV ────────────────────────────────────── */

export interface RawEpisodeSummary {
  air_date?: string;
  episode_number?: number;
  id?: number;
  name?: string;
  overview?: string;
  season_number?: number;
  still_path?: string | null;
  vote_average?: number;
}

export interface RawSeasonSummary {
  air_date?: string;
  episode_count?: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  season_number?: number;
}

export interface RawNetwork {
  id: number;
  logo_path?: string | null;
  name?: string;
  origin_country?: string;
}

export interface RawShow {
  backdrop_path?: string | null;
  content_ratings?: {
    results?: Array<{ iso_3166_1?: string; rating?: string }>;
  };
  created_by?: Array<{ id: number; name?: string; profile_path?: string | null }>;
  credits?: { cast?: RawCastMember[]; crew?: RawCrewMember[] };
  episode_run_time?: number[];
  external_ids?: RawExternalIds;
  first_air_date?: string;
  genres?: RawGenre[];
  homepage?: string | null;
  id: number;
  in_production?: boolean;
  keywords?: { results?: RawKeyword[] };
  last_air_date?: string;
  last_episode_to_air?: RawEpisodeSummary | null;
  name?: string;
  networks?: RawNetwork[];
  next_episode_to_air?: RawEpisodeSummary | null;
  number_of_episodes?: number;
  number_of_seasons?: number;
  original_name?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  recommendations?: { results?: RawSummaryItem[] };
  seasons?: RawSeasonSummary[];
  similar?: { results?: RawSummaryItem[] };
  status?: string;
  tagline?: string;
  type?: string;
  videos?: { results?: RawVideo[] };
  vote_average?: number;
  vote_count?: number;
}

/* ─────────────────────────── Raw season ────────────────────────────────── */

export interface RawEpisode {
  air_date?: string;
  episode_number: number;
  guest_stars?: RawCastMember[];
  name?: string;
  overview?: string;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
}

export interface RawSeason {
  _id?: string;
  air_date?: string;
  credits?: { cast?: RawCastMember[]; crew?: RawCrewMember[] };
  episodes?: RawEpisode[];
  id?: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  season_number?: number;
  vote_average?: number;
}

/* ─────────────────────────── Raw person ────────────────────────────────── */

export interface RawCombinedCredit extends RawSummaryItem {
  character?: string;
  department?: string;
  job?: string;
}

export interface RawPerson {
  also_known_as?: string[];
  biography?: string;
  birthday?: string | null;
  combined_credits?: { cast?: RawCombinedCredit[]; crew?: RawCombinedCredit[] };
  deathday?: string | null;
  external_ids?: RawExternalIds;
  gender?: number;
  homepage?: string | null;
  id: number;
  imdb_id?: string | null;
  known_for_department?: string;
  name?: string;
  place_of_birth?: string | null;
  popularity?: number;
  profile_path?: string | null;
}

/* ─────────────────────────── Raw search/discover/trending ──────────────── */

export interface RawPaginatedResult<T = RawSummaryItem> {
  page?: number;
  results?: T[];
  total_pages?: number;
  total_results?: number;
}

/* ─────────────────────────── Raw watch providers ───────────────────────── */

export interface RawProvider {
  display_priority?: number;
  logo_path?: string | null;
  provider_id: number;
  provider_name?: string;
}

export interface RawWatchProviderRegion {
  ads?: RawProvider[];
  buy?: RawProvider[];
  flatrate?: RawProvider[];
  free?: RawProvider[];
  link?: string;
  rent?: RawProvider[];
}

export interface RawWatchProviders {
  id?: number;
  results?: Record<string, RawWatchProviderRegion>;
}

/* ═══════════════════════════ Domain (normalized) ════════════════════════ */

/** A normalized summary card — search/discover/trending/recommendations. */
export interface SummaryItem {
  genre_names?: string[];
  id: number;
  known_for?: Array<{
    id: number;
    media_type: MediaType;
    title: string;
    poster_url?: string;
  }>;
  known_for_department?: string;
  media_type: MediaType;
  overview?: string;
  popularity?: number;
  poster_url?: string;
  profile_url?: string;
  release_year?: number;
  title: string;
  vote_average?: number;
  vote_count?: number;
}

export interface PaginatedSummary {
  page: number;
  results: SummaryItem[];
  total_pages: number;
  total_results: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  character?: string;
  id: number;
  name: string;
  order?: number;
  profile_url?: string;
}

export interface CrewMember {
  department?: string;
  id: number;
  job: string;
  name: string;
  profile_url?: string;
}

export interface Trailer {
  key: string;
  name: string;
  site: string;
  type?: string;
  url: string;
}

export interface MovieDetail {
  backdrop_url?: string;
  budget?: number;
  cast?: CastMember[];
  crew_key?: CrewMember[];
  external_ids?: Record<string, string>;
  genres: Genre[];
  homepage?: string;
  id: number;
  imdb_id?: string;
  keywords?: Genre[];
  original_title?: string;
  overview?: string;
  popularity: number;
  poster_url?: string;
  recommendations?: SummaryItem[];
  release_date?: string;
  revenue?: number;
  runtime_minutes?: number;
  similar?: SummaryItem[];
  status?: string;
  tagline?: string;
  title: string;
  trailers?: Trailer[];
  us_certification?: string;
  vote_average: number;
  vote_count: number;
}

export interface EpisodeSummary {
  air_date?: string;
  episode_number?: number;
  id?: number;
  name: string;
  overview?: string;
  season_number?: number;
  still_url?: string;
  vote_average?: number;
}

export interface SeasonSummary {
  air_date?: string;
  episode_count: number;
  name: string;
  overview?: string;
  poster_url?: string;
  season_number: number;
}

export interface Network {
  id: number;
  logo_url?: string;
  name: string;
  origin_country?: string;
}

export interface ShowDetail {
  backdrop_url?: string;
  cast?: CastMember[];
  created_by?: CastMember[];
  crew_key?: CrewMember[];
  episode_run_time?: number[];
  external_ids?: Record<string, string>;
  first_air_date?: string;
  genres: Genre[];
  homepage?: string;
  id: number;
  in_production: boolean;
  keywords?: Genre[];
  last_air_date?: string;
  last_episode_to_air?: EpisodeSummary;
  name: string;
  networks?: Network[];
  next_episode_to_air?: EpisodeSummary;
  number_of_episodes: number;
  number_of_seasons: number;
  original_name?: string;
  overview?: string;
  popularity: number;
  poster_url?: string;
  recommendations?: SummaryItem[];
  seasons: SeasonSummary[];
  similar?: SummaryItem[];
  status?: string;
  tagline?: string;
  trailers?: Trailer[];
  type?: string;
  us_content_rating?: string;
  vote_average: number;
  vote_count: number;
}

export interface Episode {
  air_date?: string;
  episode_number: number;
  guest_stars?: CastMember[];
  name: string;
  overview?: string;
  runtime_minutes?: number;
  still_url?: string;
  vote_average?: number;
}

export interface SeasonDetail {
  air_date?: string;
  episodes: Episode[];
  name: string;
  overview?: string;
  poster_url?: string;
  regular_cast?: CastMember[];
  season_number: number;
  series_id: number;
  vote_average?: number;
}

export interface PersonCastCredit {
  character?: string;
  id: number;
  media_type: MediaType;
  poster_url?: string;
  release_year?: number;
  title: string;
  vote_average?: number;
}

export interface PersonCrewCredit {
  department?: string;
  id: number;
  job: string;
  media_type: MediaType;
  poster_url?: string;
  release_year?: number;
  title: string;
}

export type GenderLabel = 'unknown' | 'female' | 'male' | 'non-binary';

export interface PersonDetail {
  also_known_as?: string[];
  biography?: string;
  birthday?: string;
  cast_credits: PersonCastCredit[];
  /** Total cast credits before any display cap (recency-ordered). */
  cast_credits_total: number;
  crew_credits: PersonCrewCredit[];
  /** Total crew credits before any display cap (recency-ordered). */
  crew_credits_total: number;
  deathday?: string;
  external_ids?: Record<string, string>;
  gender?: GenderLabel;
  homepage?: string;
  id: number;
  imdb_id?: string;
  known_for_department?: string;
  name: string;
  place_of_birth?: string;
  popularity: number;
  profile_url?: string;
}

export interface Provider {
  display_priority: number;
  logo_url?: string;
  provider_id: number;
  provider_name: string;
}

export interface WatchProviders {
  ads: Provider[];
  buy: Provider[];
  flatrate: Provider[];
  free: Provider[];
  id: number;
  link?: string;
  media_type: DiscoverMediaType;
  region: string;
  rent: Provider[];
}
