import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ModModal } from '../src/main/mod-modal';

describe('ModModal', () => {
  const sent: Array<[string, unknown]> = [];
  const mod = new ModModal((ch, p) => sent.push([ch, p]));
  const server = http.createServer((req, res) => {
    if (!mod.handle(req, res)) res.writeHead(404).end();
  });
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('shows a view and hands a press to the waiting poll', async () => {
    const view = { id: 'm', title: 'T', markdown: '# hi', buttons: [{ key: 'a', label: 'A' }] };
    expect((await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify(view) })).status).toBe(204);
    expect(sent[0]).toEqual(['show', { ...view, placement: 'float', buttons: [{ key: 'a', label: 'A', primary: false }] }]);

    const wait = fetch(`${base}/mod/wait?id=m`);
    await new Promise((r) => setTimeout(r, 20));
    mod.press('m', 'a');
    expect(await (await wait).json()).toEqual({ key: 'a' });
  });

  it('queues a press made while nobody polls', async () => {
    mod.press('q', '__close');
    expect(await (await fetch(`${base}/mod/wait?id=q`)).json()).toEqual({ key: '__close' });
  });

  it('passes tabs through, buttons cleaned', async () => {
    const tabs = [{ key: 'a', label: 'A', markdown: 'x', buttons: [{ key: 'k', label: 'K', extra: 1 }] }, { key: 'b', label: 'B' }];
    await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify({ id: 't', placement: 'sidebar', tabs }) });
    expect(sent.at(-1)?.[1]).toMatchObject({
      placement: 'sidebar',
      tabs: [{ key: 'a', label: 'A', markdown: 'x', buttons: [{ key: 'k', label: 'K', primary: false }] }, { key: 'b', label: 'B', markdown: '', buttons: [] }],
    });
  });

  it('rejects a view without an id', async () => {
    expect((await fetch(`${base}/mod/show`, { method: 'POST', body: '{}' })).status).toBe(400);
  });
});
