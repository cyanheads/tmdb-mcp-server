/**
 * @fileoverview Collection requests through the production fetch and retry boundary.
 * @module tests/services/tmdb-collection-wire.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TmdbService } from '@/services/tmdb/tmdb-service.js';
import { STARTUP_ROUTES } from '../helpers/mock-tmdb.js';

const movie = {
  id: 954,
  title: 'Mission: Impossible',
  belongs_to_collection: { id: 87359, name: 'Mission: Impossible Collection' },
};
const fetchUpstream = vi.fn<typeof fetch>();
const svc = new TmdbService('test-token');

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchUpstream);
  fetchUpstream.mockReset().mockImplementation(async (request) => {
    const startupBody = STARTUP_ROUTES[new URL(String(request)).pathname.slice(2)];
    if (!startupBody) throw new Error('Unexpected startup request.');
    return Response.json(startupBody);
  });
  await svc.init(createMockContext());
  fetchUpstream.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('uses one request by default and when an opted-in movie has no collection', async () => {
  fetchUpstream
    .mockResolvedValueOnce(Response.json(movie))
    .mockResolvedValueOnce(Response.json({ ...movie, belongs_to_collection: null }));
  const ctx = createMockContext();
  const plain = await svc.getMovie(954, [], ctx, 'fr-FR');
  const standalone = await svc.getMovie(954, ['collection'], ctx, 'fr-FR');
  expect(plain.collection).toEqual({ id: 87359, name: 'Mission: Impossible Collection' });
  expect(standalone).not.toHaveProperty('collection');
  expect(fetchUpstream.mock.calls.map(([url]) => String(url))).toEqual([
    'https://api.themoviedb.org/3/movie/954?language=fr-FR',
    'https://api.themoviedb.org/3/movie/954?language=fr-FR',
  ]);
});

it('preserves an empty collection and excludes the synthetic append from the movie request', async () => {
  fetchUpstream
    .mockResolvedValueOnce(Response.json(movie))
    .mockResolvedValueOnce(Response.json({ parts: [] }));
  const result = await svc.getMovie(954, ['videos', 'collection'], createMockContext(), 'fr-FR');
  expect(result.collection?.parts).toEqual([]);
  expect(fetchUpstream.mock.calls.map(([url]) => String(url))).toEqual([
    'https://api.themoviedb.org/3/movie/954?language=fr-FR&append_to_response=videos',
    'https://api.themoviedb.org/3/collection/87359?language=fr-FR',
  ]);
});

it('propagates cancellation during the collection request without retrying', async () => {
  const controller = new AbortController();
  const enteredCollection = Promise.withResolvers<void>();
  fetchUpstream
    .mockResolvedValueOnce(Response.json(movie))
    .mockImplementationOnce(async (_, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Missing outbound cancellation signal.');
      return new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        enteredCollection.resolve();
      });
    });
  const result = svc.getMovie(
    954,
    ['collection'],
    createMockContext({ signal: controller.signal }),
  );
  await enteredCollection.promise;
  controller.abort();
  await expect(result).rejects.toMatchObject({ code: JsonRpcErrorCode.RequestCancelled });
  expect(fetchUpstream).toHaveBeenCalledTimes(2);
});

it('shares a 40-second deadline between movie detail and collection retry backoff', async () => {
  vi.useFakeTimers();
  fetchUpstream
    .mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 14_000));
      return Response.json(movie);
    })
    .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { 'Retry-After': '30' } }))
    .mockResolvedValueOnce(Response.json({ parts: [] }));

  const result = svc.getMovie(954, ['collection'], createMockContext());
  const outcome = result.then(
    (value) => value,
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(44_000);
  expect(await outcome).toMatchObject({
    code: JsonRpcErrorCode.Timeout,
    data: { reason: 'retry_deadline_exceeded', deadlineMs: 40_000 },
  });
  expect(fetchUpstream).toHaveBeenCalledTimes(2);
});
