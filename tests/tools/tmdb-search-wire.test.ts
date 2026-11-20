/** Exercises search through the production tool contract and real fetch helper. */
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetServerConfig } from '@/config/server-config.js';
import { tmdbSearchTitles } from '@/mcp-server/tools/definitions/tmdb-search-titles.tool.js';
import { initTmdbService, resetTmdbService } from '@/services/tmdb/tmdb-service.js';
import { STARTUP_ROUTES } from '../helpers/mock-tmdb.js';

const fetchUpstream = vi.fn<typeof fetch>();
const upstreamDetail = 'TMDB internal diagnostic';

beforeEach(async () => {
  vi.stubEnv('TMDB_API_KEY', 'test-token');
  vi.stubGlobal('fetch', fetchUpstream);
  fetchUpstream.mockReset().mockImplementation(async (request) => {
    const url = new URL(String(request));
    const startupBody = STARTUP_ROUTES[url.pathname.slice('/3'.length)];
    if (startupBody) return Response.json(startupBody);
    expect(url.pathname).toBe('/3/search/multi');
    if (url.searchParams.get('query') === 'unavailable') {
      return Response.json({ status_message: upstreamDetail }, { status: 401 });
    }
    expect(url.searchParams.get('page')).toBe('500');
    return Response.json({
      page: 500,
      total_pages: 500,
      total_results: 9981,
      results: [{ id: 21, media_type: 'movie', title: 'Sparse Title' }],
    });
  });
  await initTmdbService().init(createMockContext());
  fetchUpstream.mockClear();
});

afterEach(() => {
  resetTmdbService();
  resetServerConfig();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('preserves sparse results at the final allowed page on both result surfaces', async () => {
  const result = await runToolContract(tmdbSearchTitles, { query: 'sparse', page: 500 });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    page: 500,
    totalCount: 9981,
  });
  expect(result.structuredContent).toHaveProperty('results', [
    { id: 21, media_type: 'movie', title: 'Sparse Title' },
  ]);
  expect(result.content[0]).toMatchObject({
    type: 'text',
    text: expect.stringMatching(/page 500\/500[\s\S]*Sparse Title[\s\S]*id 21/),
  });
});

it('keeps the status-mapped error while withholding the upstream body', async () => {
  const result = await runToolContract(tmdbSearchTitles, { query: 'unavailable' });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    error: { code: JsonRpcErrorCode.Unauthorized, data: { statusCode: 401 } },
  });
  expect(result.structuredContent).not.toHaveProperty('error.data.body');
  expect(result.structuredContent).not.toHaveProperty('error.data.responseBody');
  expect(JSON.stringify(result.content)).not.toContain(upstreamDetail);
  expect(fetchUpstream).toHaveBeenCalledTimes(1);
});

it('explains the range failure after repairing a numeric string', async () => {
  // Widen the test runner's input type to exercise an untyped MCP client's arguments.
  const result = await runToolContract<Parameters<typeof runToolContract>[0]>(tmdbSearchTitles, {
    query: 'sparse',
    page: '501',
  });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    error: { message: expect.stringMatching(/page: Too big: expected number to be <=500/) },
  });
  expect(JSON.stringify(result.content)).toContain('expected number to be <=500');
  expect(fetchUpstream).not.toHaveBeenCalled();
});
