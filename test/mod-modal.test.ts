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

  it('drops presses queued for a view the mod then closed', async () => {
    mod.press('mail', '__close'); // dismissed while the mod was not polling
    expect((await fetch(`${base}/mod/close`, { method: 'POST', body: JSON.stringify({ id: 'mail' }) })).status).toBe(204);
    // The mod shows the mailbox again under the same id: its next poll must get
    // that view's own press, not the dismissal of the view before it.
    mod.press('mail', 'open:1');
    expect(await (await fetch(`${base}/mod/wait?id=mail`)).json()).toEqual({ key: 'open:1' });
  });

  it('passes tabs through, buttons cleaned', async () => {
    const tabs = [{ key: 'a', label: 'A', markdown: 'x', buttons: [{ key: 'k', label: 'K', extra: 1 }] }, { key: 'b', label: 'B' }];
    await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify({ id: 't', placement: 'sidebar', tabs }) });
    expect(sent.at(-1)?.[1]).toMatchObject({
      placement: 'sidebar',
      tabs: [{ key: 'a', label: 'A', markdown: 'x', buttons: [{ key: 'k', label: 'K', primary: false }] }, { key: 'b', label: 'B', markdown: '', buttons: [] }],
    });
  });

  it('passes a mod\'s own html through, capped', async () => {
    sent.length = 0;
    const view = { id: 'h', title: 'H', markdown: '', buttons: [], html: '<b data-key="x">hi</b>' };
    expect((await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify(view) })).status).toBe(204);
    expect((sent[0]![1] as { html?: string }).html).toBe('<b data-key="x">hi</b>');
  });

  it('a new show drops presses queued for the view before it', async () => {
    mod.press('stale', '__close'); // ✕ while no mod was polling
    const view = { id: 'stale', title: 'T', markdown: '', buttons: [] };
    await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify(view) });
    const wait = fetch(`${base}/mod/wait?id=stale`);
    await new Promise((r) => setTimeout(r, 20));
    mod.press('stale', 'fresh');
    expect(await (await wait).json()).toEqual({ key: 'fresh' });
  });

  it('keeps a press when a show only refreshes the view it was made on', async () => {
    const view = { id: 'live', title: 'Mail', markdown: 'one', buttons: [] };
    await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify(view) });
    mod.press('live', 'open:1'); // pressed between two polls
    // The mod redraws the same view (new mail arrived) before it polls again:
    // that is a refresh, not a reopen, so the press is still owed to it.
    await fetch(`${base}/mod/show`, { method: 'POST', body: JSON.stringify({ ...view, markdown: 'two' }) });
    expect(await (await fetch(`${base}/mod/wait?id=live`)).json()).toEqual({ key: 'open:1' });
  });

  it('hands out a key again when the mod does not acknowledge it', async () => {
    // The mod opts in by sending ack at all; its first poll has nothing to ack.
    mod.press('ackv', 'open:7');
    expect(await (await fetch(`${base}/mod/wait?id=ackv&ack=`)).json()).toEqual({ key: 'open:7' });
    // Its next poll acknowledges nothing: as far as dash knows that key never
    // arrived (the poll could have died with it), so it is owed again.
    expect(await (await fetch(`${base}/mod/wait?id=ackv&ack=`)).json()).toEqual({ key: 'open:7' });
    // Acknowledged this time, and a press made meanwhile comes next, in order.
    mod.press('ackv', 'back');
    expect(await (await fetch(`${base}/mod/wait?id=ackv&ack=open:7`)).json()).toEqual({ key: 'back' });
  });

  it('redelivers an unacknowledged key before later presses', async () => {
    mod.press('ordv', 'first');
    expect(await (await fetch(`${base}/mod/wait?id=ordv&ack=`)).json()).toEqual({ key: 'first' });
    mod.press('ordv', 'second'); // pressed after 'first' was handed out
    expect(await (await fetch(`${base}/mod/wait?id=ordv&ack=`)).json()).toEqual({ key: 'first' });
    expect(await (await fetch(`${base}/mod/wait?id=ordv&ack=first`)).json()).toEqual({ key: 'second' });
  });

  it('never redelivers to a mod that does not use ack', async () => {
    mod.press('plain', 'open:1');
    expect(await (await fetch(`${base}/mod/wait?id=plain`)).json()).toEqual({ key: 'open:1' });
    mod.press('plain', 'back');
    expect(await (await fetch(`${base}/mod/wait?id=plain`)).json()).toEqual({ key: 'back' });
  });

  it('rejects a view without an id', async () => {
    expect((await fetch(`${base}/mod/show`, { method: 'POST', body: '{}' })).status).toBe(400);
  });

  it('hands a send offer to the renderer and nothing else', async () => {
    sent.length = 0;
    const offer = { id: 'mail', title: 'Reply to #28', text: 'Draft a reply…\n\nline 2' };
    expect((await fetch(`${base}/mod/send-offer`, { method: 'POST', body: JSON.stringify(offer) })).status).toBe(204);
    expect(sent).toEqual([['offer', offer]]);
  });

  it('rejects a send offer without text', async () => {
    sent.length = 0;
    for (const body of [{ id: 'mail' }, { id: 'mail', text: '  ' }, { id: 'mail', text: 7 }, { text: 'hi' }]) {
      expect((await fetch(`${base}/mod/send-offer`, { method: 'POST', body: JSON.stringify(body) })).status).toBe(400);
    }
    expect(sent).toEqual([]);
  });
});
