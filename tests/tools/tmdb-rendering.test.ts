/** Render-time escaping preserves upstream text and renders media without changing records. */
import { describe, expect, it } from 'vitest';
import {
  noticeTrailer,
  renderSummaryItem,
  renderTrailer,
} from '@/mcp-server/tools/definitions/_shared.js';

describe('TMDB Markdown rendering', () => {
  it('keeps title markup literal and renders a poster as an image', () => {
    const item = {
      id: 42,
      media_type: 'movie' as const,
      title: 'A*p* [x](y)',
      overview: '<b>story</b>\n- item',
      poster_url: 'https://example.com/a(b).jpg',
    };
    expect(renderSummaryItem(item)).toBe(
      'A\\*p\\* \\[x\\](y) (id 42, movie) ![poster](<https://example.com/a(b).jpg>) — \\<b>story\\</b>\\\n\\- item',
    );
    expect(item.title).toBe('A*p* [x](y)');
    expect(item.overview).toBe('<b>story</b>\n- item');
  });

  it('keeps notice syntax and every line inside a literal blockquote', () => {
    expect(noticeTrailer.notice.render('No *match*\n# heading')).toBe(
      '> No \\*match\\*\\\n> \\# heading',
    );
  });

  it('renders a trailer label literally and refuses an executable destination', () => {
    expect(
      renderTrailer({ name: '[play]', key: 'abc', url: 'javascript:alert(1)', site: 'YouTube' }),
    ).toBe('\\[play\\] (javascript:alert(1)) — YouTube, key abc');
  });
});
