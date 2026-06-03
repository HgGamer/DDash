// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  renderMarkdown,
  resolveWithinRoot,
  sanitizeHtml,
  slugify,
  toFileUrl,
} from '../src/renderer/src/lib/markdown';

const ROOT = '/home/user/project';

function render(md: string): string {
  return renderMarkdown(md, { projectRoot: ROOT });
}

describe('markdown sanitizer', () => {
  it('strips <script> blocks entirely', () => {
    const html = sanitizeHtml('<p>hi</p><script>alert(1)</script>', { projectRoot: ROOT });
    expect(html).toContain('hi');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('renders a javascript: link as inert text', () => {
    const html = render('[click me](javascript:alert(1))');
    expect(html).toContain('click me');
    expect(html).not.toContain('<a');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('keeps http(s) and mailto links and marks them external', () => {
    const html = render('[site](https://example.com) and [mail](mailto:a@b.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('data-external="true"');
    expect(html).toContain('href="mailto:a@b.com"');
  });

  it('rewrites a relative image src to a file:// URL under the project root', () => {
    const html = render('![diagram](./docs/diagram.png)');
    expect(html).toContain('src="file:///home/user/project/docs/diagram.png"');
  });

  it('replaces an escaping image with its alt text and issues no file load', () => {
    const html = render('![secret](../../etc/passwd)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('file://');
    expect(html).toContain('secret');
  });

  it('passes through remote https images', () => {
    const html = render('![remote](https://example.com/a.png)');
    expect(html).toContain('src="https://example.com/a.png"');
  });

  it('drops data: images to alt text', () => {
    const html = render('![x](data:image/png;base64,AAAA)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('data:image');
  });

  it('gives headings stable, unique ids', () => {
    const html = render('# Install\n\n## Install\n');
    expect(html).toContain('id="install"');
    expect(html).toContain('id="install-1"');
  });

  it('strips inline event handlers', () => {
    const html = sanitizeHtml('<p onclick="evil()">hi</p>', { projectRoot: ROOT });
    expect(html).not.toContain('onclick');
  });

  it('keeps tables', () => {
    const html = render('| a | b |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toContain('<table');
    expect(html).toContain('<td>1</td>');
  });
});

describe('path helpers', () => {
  it('resolveWithinRoot keeps paths inside the root', () => {
    expect(resolveWithinRoot(ROOT, './docs/a.png')).toBe('/home/user/project/docs/a.png');
    expect(resolveWithinRoot(ROOT, 'a/b/../c.png')).toBe('/home/user/project/a/c.png');
  });

  it('resolveWithinRoot rejects escapes, absolutes, and schemes', () => {
    expect(resolveWithinRoot(ROOT, '../../etc/passwd')).toBeNull();
    expect(resolveWithinRoot(ROOT, '/etc/passwd')).toBeNull();
    expect(resolveWithinRoot(ROOT, 'http://x/y.png')).toBeNull();
  });

  it('toFileUrl encodes spaces', () => {
    expect(toFileUrl('/a b/c.png')).toBe('file:///a%20b/c.png');
  });

  it('slugify produces anchor-friendly ids', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });
});
