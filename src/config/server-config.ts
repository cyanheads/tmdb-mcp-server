/**
 * @fileoverview Server-specific configuration for tmdb-mcp-server.
 * Parses TMDB env vars via a dedicated Zod schema, kept separate from the
 * framework's core config. Lazy-parsed so Workers can inject env at request time.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

/**
 * Schema for TMDB-specific environment variables.
 *
 * `apiKey` is the v4 API Read Access Token (a JWT) — sent as
 * `Authorization: Bearer ${apiKey}`, never as a `?api_key=` query param.
 */
const ServerConfigSchema = z.object({
  apiKey: z.string().min(1).describe('TMDB v4 API Read Access Token (Bearer). Required.'),
  language: z
    .string()
    .default('en-US')
    .describe('Default response language (ISO 639-1[-COUNTRY]), e.g. "en-US".'),
  defaultRegion: z
    .string()
    .default('US')
    .describe('Default ISO 3166-1 region hint for region-aware error messages.'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

/**
 * Returns the parsed, cached server configuration.
 *
 * Maps schema paths to env var names so a missing/invalid value names the
 * variable (`TMDB_API_KEY`) rather than the schema path. Throws
 * `ConfigurationError` on the first call when required vars are absent — the
 * framework renders it as a clean startup banner.
 */
export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    apiKey: 'TMDB_API_KEY',
    language: 'TMDB_LANGUAGE',
    defaultRegion: 'TMDB_DEFAULT_REGION',
  });
  return _config;
}

/**
 * Resets the cached config. Test-only — lets a suite re-parse env after
 * mutating `process.env`.
 */
export function resetServerConfig(): void {
  _config = undefined;
}
