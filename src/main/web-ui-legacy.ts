// Legacy variant of the Dash LAN web UI for old WebKit browsers — primarily
// the BlackBerry 10 stock browser (WebKit 537, ~Chrome 25 era). Served by
// web-server.ts when the User-Agent looks like BB10/BlackBerry/PlayBook or
// when `?ui=legacy` is requested.
//
// Constraints honoured here (vs the modern APP_HTML):
//   - ES5 only: no arrow functions, let/const, template literals, Promise,
//     fetch, Object.assign, String.prototype.startsWith/includes.
//   - CSS: no custom properties, grid, flexbox gap, env(), dvh, min().
//   - No xterm.js — a small VT100 screen-model renderer (cursor addressing,
//     scroll regions, SGR colors, alt screen) paints into a <pre> instead.
//   - Same REST + WebSocket protocol as the modern UI (BB10 speaks RFC 6455).
//
// Like web-ui.ts, the client script avoids backticks and `${` so it survives
// embedding in a TS template literal.

export const LEGACY_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Dash</title>
<style>
  html, body { margin: 0; padding: 0; background: #0a0e1c; color: #e9edf7;
    font: 14px "Slate Pro", Helvetica, Arial, sans-serif; }
  body { padding-bottom: 56px; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; }
  .hidden { display: none; }
  .screen { display: none; }
  .screen.on { display: block; }

  /* ── Header ── */
  .ph { padding: 12px 16px 8px; overflow: hidden; }
  .ph .logo { float: left; width: 30px; height: 30px; margin-right: 10px;
    background: #ffd60a; color: #171200; border-radius: 8px;
    font: bold 15px Menlo, Monaco, monospace; text-align: center; line-height: 30px; }
  .ph .ph-title { display: block; overflow: hidden; font-size: 19px; font-weight: bold;
    line-height: 30px; white-space: nowrap; text-overflow: ellipsis; }
  .ph .iconbtn { float: right; width: 36px; height: 30px; margin-left: 8px;
    background: #121829; border: 1px solid #222b47; border-radius: 9px;
    color: #97a0bc; font-size: 16px; line-height: 28px; text-align: center; }
  .ph .backbtn { float: left; width: 26px; height: 30px; color: #e9edf7;
    font-size: 24px; line-height: 28px; }
  .ph .chip { float: right; max-width: 40%; padding: 4px 9px; margin-top: 2px;
    background: #121829; border: 1px solid #222b47; border-radius: 999px;
    font-size: 12px; color: #97a0bc; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }

  /* ── Projects ── */
  .search { margin: 4px 16px 10px; background: #121829; border: 1px solid #222b47;
    border-radius: 10px; padding: 8px 12px; }
  .search input { width: 100%; background: none; border: 0; outline: none;
    color: #e9edf7; font-size: 15px; }
  .cards { padding: 0 16px 16px; }
  .card { background: #121829; border: 1px solid #222b47; border-radius: 14px;
    padding: 13px 14px; margin-bottom: 10px; }
  .card-name { font-weight: bold; font-size: 15px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .card-name .st { float: right; font-weight: normal; font-size: 12px; color: #97a0bc; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 7px;
    background: #5d678a; margin-right: 4px; }
  .dot.on { background: #3ddc84; }
  .card-sub { margin-top: 4px; color: #5d678a; font-size: 12px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .card-bottom { margin-top: 8px; color: #97a0bc; font-size: 12px; overflow: hidden; }
  .card-bottom .branch { float: right; }
  .wtrow { display: block; width: 100%; box-sizing: border-box; margin-top: 8px;
    padding: 8px 10px; background: #0a0e1c; border: 1px solid #222b47; border-radius: 9px;
    color: #e9edf7; font-size: 12px; text-align: left; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .empty { padding: 28px 16px; color: #5d678a; font-size: 13px; text-align: center; }

  /* ── Workspace ── */
  .seg { margin: 2px 16px 8px; padding: 3px; background: #121829;
    border: 1px solid #222b47; border-radius: 11px; overflow: hidden; }
  .seg button { float: left; width: 50%; padding: 7px 0; border-radius: 8px;
    font-size: 13px; font-weight: bold; color: #97a0bc; text-align: center; }
  .seg button.on { background: #1a2238; color: #e9edf7; }
  #term { display: block; height: 300px; overflow: auto; margin: 0 8px;
    background: #000; color: #e9edf7; border: 1px solid #222b47; border-radius: 6px;
    padding: 4px; font: 12px Menlo, Monaco, "Courier New", monospace; line-height: 15px;
    white-space: pre; }
  /* Tap the terminal to go fullscreen; tap again to restore. */
  body.termfull #term { position: fixed; top: 0; left: 0; right: 0; z-index: 60;
    margin: 0; border: 0; border-radius: 0; }
  body.termfull #tabbar { display: none; }

  /* ── Files ── */
  .crumbs { padding: 2px 16px 8px; white-space: nowrap; overflow-x: auto;
    font-size: 12px; color: #5d678a; }
  .crumbs button { color: #7aa2ff; padding: 4px 2px; font-size: 12px; }
  .filelist { padding: 0 16px 16px; }
  .frow { display: block; width: 100%; box-sizing: border-box; padding: 11px 12px;
    border-bottom: 1px solid #222b47; font-size: 14px; text-align: left;
    color: #e9edf7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .frow .ic { color: #97a0bc; margin-right: 8px; }
  .frow.dir .ic { color: #ffd60a; }
  .frow .sz { float: right; color: #5d678a; font-size: 11px; }
  .fileview { display: block; margin: 0 16px 16px; padding: 12px; overflow: auto;
    background: #121829; border: 1px solid #222b47; border-radius: 12px;
    font: 12px Menlo, Monaco, monospace; color: #e9edf7; white-space: pre; }

  /* ── Git ── */
  .gitbar { margin: 2px 16px 10px; padding: 9px 12px; background: #121829;
    border: 1px solid #222b47; border-radius: 10px; font-size: 13px; overflow: hidden;
    white-space: nowrap; text-overflow: ellipsis; }
  .gitbar .ab { float: right; }
  .gitbar .up { color: #3ddc84; } .gitbar .down { color: #ffb02e; }
  .gsec { margin: 0 16px 12px; background: #121829; border: 1px solid #222b47;
    border-radius: 13px; overflow: hidden; }
  .gsec-h { padding: 11px 13px; border-bottom: 1px solid #222b47; font-weight: bold;
    font-size: 13px; }
  .gsec-h .cnt { float: right; min-width: 20px; padding: 1px 6px; border-radius: 999px;
    background: #1a2238; color: #97a0bc; font-size: 11px; text-align: center; }
  .grow { display: block; width: 100%; box-sizing: border-box; padding: 10px 13px;
    border-bottom: 1px solid #222b47; font-size: 13px; text-align: left; color: #e9edf7;
    white-space: nowrap; overflow: hidden; }
  .grow .badge { display: inline-block; width: 18px; height: 18px; border-radius: 5px;
    margin-right: 9px; font-size: 10px; font-weight: bold; text-align: center;
    line-height: 18px; }
  .badge.M { background: #3a2c10; color: #ffb02e; }
  .badge.A { background: #103a22; color: #3ddc84; }
  .badge.D { background: #3a1414; color: #ff6b6b; }
  .badge.U { background: #141f3a; color: #7aa2ff; }
  .grow .act { float: right; width: 26px; height: 22px; border: 1px solid #222b47;
    border-radius: 7px; color: #97a0bc; font-size: 15px; line-height: 20px;
    text-align: center; }
  .diffbox { margin: 0 16px 12px; background: #121829; border: 1px solid #222b47;
    border-radius: 13px; overflow: hidden; }
  .diffbox .dh { padding: 9px 13px; border-bottom: 1px solid #222b47; font-size: 12px;
    color: #e9edf7; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .diffbox .dh button { float: right; color: #97a0bc; }
  .diffbox pre { margin: 0; padding: 8px 12px; overflow-x: auto;
    font: 11px Menlo, Monaco, monospace; }
  .dl-add { background: #112619; color: #9fe8c0; }
  .dl-del { background: #2a1414; color: #f0a4a4; }
  .dl-hunk { color: #7aa2ff; }
  .dl-meta { color: #5d678a; }
  .commitbox { padding: 4px 16px 10px; background: #0a0e1c; border-top: 1px solid #222b47; }
  .commitbox input { width: 100%; box-sizing: border-box; padding: 11px 13px;
    font-size: 14px; background: #121829; color: #e9edf7; border: 1px solid #222b47;
    border-radius: 10px; outline: none; margin-bottom: 9px; }
  .btn-primary { display: block; width: 100%; padding: 12px; border-radius: 11px;
    background: #ffd60a; color: #171200; font-size: 15px; font-weight: bold;
    text-align: center; }
  .btn-primary[disabled] { opacity: 0.4; }

  /* ── Settings ── */
  .srow { padding: 13px 14px; border-bottom: 1px solid #222b47; font-size: 14px;
    overflow: hidden; }
  .srow .k { color: #97a0bc; }
  .srow .v { float: right; max-width: 55%; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }
  .danger { display: block; width: 100%; box-sizing: border-box; color: #ff6b6b;
    text-align: center; padding: 13px; font-weight: bold; background: #121829;
    border: 1px solid #222b47; border-radius: 13px; }
  .footer-note { text-align: center; color: #5d678a; font-size: 12px; padding: 16px; }

  /* ── Tab bar ── */
  #tabbar { position: fixed; bottom: 0; left: 0; right: 0; height: 52px;
    background: #121829; border-top: 1px solid #222b47; overflow: hidden; }
  #tabbar button { float: left; width: 25%; height: 52px; color: #5d678a;
    font-size: 11px; font-weight: bold; text-align: center; }
  #tabbar button.on { color: #ffd60a; }

  /* ── Toast ── */
  #toast { display: none; position: fixed; z-index: 70; left: 8%; right: 8%; bottom: 68px;
    background: #1a2238; border: 1px solid #2e3a5c; color: #e9edf7;
    padding: 10px 16px; border-radius: 11px; font-size: 13px; text-align: center; }
  #toast.show { display: block; }
</style>
</head>
<body>

<!-- Projects -->
<div id="scr-projects" class="screen on">
  <div class="ph">
    <span class="logo">D_</span>
    <button class="iconbtn" id="projRefresh">&#8635;</button>
    <span class="ph-title">Projects</span>
  </div>
  <div class="search"><input id="projSearch" placeholder="Search projects..." autocomplete="off"></div>
  <div class="cards" id="projList"></div>
</div>

<!-- Workspace -->
<div id="scr-workspace" class="screen">
  <div class="ph">
    <button class="backbtn" id="wsBack">&#8249;</button>
    <span class="chip" id="wsBranch">&#8212;</span>
    <span class="ph-title" id="wsTitle">Workspace</span>
  </div>
  <div class="seg"><button id="segTerm" class="on">Terminal</button><button id="segFiles">Files</button></div>
  <div id="pane-term">
    <pre id="term"></pre>
    <div class="empty hidden" id="wsEmpty">No active session for this project.<br>Start a tab in the desktop app, then refresh.</div>
  </div>
  <div id="pane-files" class="hidden">
    <div class="crumbs" id="crumbs"></div>
    <div class="filelist" id="fileList"></div>
    <pre class="fileview hidden" id="fileView"></pre>
  </div>
</div>

<!-- Git -->
<div id="scr-git" class="screen">
  <div class="ph">
    <button class="iconbtn" id="gitRefresh">&#8635;</button>
    <span class="ph-title" id="gitTitle">Git</span>
  </div>
  <div class="gitbar"><span class="ab" id="gitAB"></span>&#9095; <span id="gitBranch">&#8212;</span></div>
  <div class="gsec">
    <div class="gsec-h"><span class="cnt" id="stagedCnt">0</span>Staged Changes</div>
    <div id="stagedList"></div>
  </div>
  <div class="gsec">
    <div class="gsec-h"><span class="cnt" id="unstagedCnt">0</span>Unstaged Changes</div>
    <div id="unstagedList"></div>
  </div>
  <div class="diffbox hidden" id="diffBox">
    <div class="dh"><button id="diffClose">&#10005;</button><span id="diffPath"></span></div>
    <pre id="diffPre"></pre>
  </div>
  <div class="commitbox">
    <input id="commitMsg" placeholder="Commit message" autocomplete="off">
    <button class="btn-primary" id="commitBtn" disabled>&#10003; Commit</button>
  </div>
</div>

<!-- Settings -->
<div id="scr-settings" class="screen">
  <div class="ph"><span class="ph-title">Settings</span></div>
  <div class="cards">
    <div class="gsec" style="margin:0 0 10px">
      <div class="srow"><span class="v" id="setHost"></span><span class="k">Server</span></div>
      <div class="srow"><span class="v" id="setConn">&#8212;</span><span class="k">Connection</span></div>
      <div class="srow"><span class="v">Legacy (BB10)</span><span class="k">UI mode</span></div>
    </div>
    <a href="/logout" style="text-decoration:none"><button class="danger">Log out</button></a>
    <div class="footer-note">Dash &middot; web &mdash; the developer toolkit in your pocket.</div>
  </div>
</div>

<div id="toast"></div>

<nav id="tabbar">
  <button data-screen="projects" class="on">Projects</button>
  <button data-screen="workspace">Workspace</button>
  <button data-screen="git">Git</button>
  <button data-screen="settings">Settings</button>
</nav>

<script>
(function () {
  'use strict';

  // ── tiny helpers ─────────────────────────────────────────────────────
  var ESC = String.fromCharCode(27);
  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.appendChild(document.createTextNode(text));
    return n;
  }
  function each(list, fn) { for (var i = 0; i < list.length; i++) fn(list[i], i); }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.innerHTML = '';
    t.appendChild(document.createTextNode(msg));
    t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 2600);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var s = Math.max(0, (new Date().getTime() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  // XHR helpers (no fetch / Promise on BB10).
  function request(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status === 401) { location.href = '/login'; return; }
      var data = null;
      try { data = JSON.parse(x.responseText); }
      catch (e) { location.href = '/login'; return; } // followed redirect to /login
      cb(data);
    };
    x.send(body ? JSON.stringify(body) : null);
  }
  function getJSON(url, cb) { request('GET', url, null, cb); }
  function postJSON(url, body, cb) { request('POST', url, body, cb); }

  // ── state ────────────────────────────────────────────────────────────
  var state = {
    screen: 'projects',
    projects: [],
    filter: '',
    current: null,      // { projectId, worktreeId, name, branch, sessionKey }
    attachedKey: null,
    filePath: '',
    gitStatus: null,
  };

  // ── navigation ───────────────────────────────────────────────────────
  var screens = { projects: 'scr-projects', workspace: 'scr-workspace', git: 'scr-git', settings: 'scr-settings' };
  function show(name) {
    state.screen = name;
    // Leaving the workspace always drops terminal fullscreen.
    if (name !== 'workspace') document.body.className = '';
    for (var k in screens) {
      $(screens[k]).className = 'screen' + (k === name ? ' on' : '');
    }
    each(document.querySelectorAll('#tabbar button'), function (b) {
      b.className = b.getAttribute('data-screen') === name ? 'on' : '';
    });
    if (name === 'projects') loadProjects();
    if (name === 'workspace') enterWorkspace();
    if (name === 'git') loadGit();
  }
  each(document.querySelectorAll('#tabbar button'), function (b) {
    b.onclick = function () { show(b.getAttribute('data-screen')); };
  });
  $('wsBack').onclick = function () { show('projects'); };

  // ── projects ─────────────────────────────────────────────────────────
  function loadProjects() {
    getJSON('/api/projects', function (r) {
      state.projects = (r && r.projects) || [];
      renderProjects();
    });
  }
  $('projRefresh').onclick = loadProjects;
  $('projSearch').oninput = function () {
    state.filter = this.value.toLowerCase();
    renderProjects();
  };

  function selectTarget(p, wt) {
    state.current = {
      projectId: p.id,
      worktreeId: wt ? wt.id : null,
      name: wt ? p.name + ' \\u00b7 ' + wt.branch : p.name,
      branch: wt ? wt.branch : (p.branch || ''),
      sessionKey: (wt ? wt.sessionKeys : p.sessionKeys)[0] || null,
    };
    state.filePath = '';
    show('workspace');
  }

  function renderProjects() {
    var list = $('projList');
    list.innerHTML = '';
    var items = [];
    each(state.projects, function (p) {
      if (!state.filter || p.name.toLowerCase().indexOf(state.filter) !== -1) items.push(p);
    });
    if (items.length === 0) {
      list.appendChild(el('div', 'empty', state.projects.length === 0
        ? 'No projects yet. Add one in the desktop app.'
        : 'No projects match your search.'));
      return;
    }
    each(items, function (p) {
      var anyActive = p.active;
      each(p.worktrees, function (w) { if (w.active) anyActive = true; });
      var card = el('div', 'card');
      var name = el('div', 'card-name');
      var st = el('span', 'st');
      st.appendChild(el('span', 'dot' + (anyActive ? ' on' : '')));
      st.appendChild(document.createTextNode(anyActive ? 'Active' : 'Idle'));
      name.appendChild(st);
      name.appendChild(document.createTextNode(p.name));
      card.appendChild(name);
      card.appendChild(el('div', 'card-sub', p.path));
      var bottom = el('div', 'card-bottom', p.lastOpenedAt ? 'Updated ' + timeAgo(p.lastOpenedAt) : 'Never opened');
      if (p.branch) {
        var br = el('span', 'branch', '\\u2387 ' + p.branch);
        bottom.insertBefore(br, bottom.firstChild);
      }
      card.appendChild(bottom);
      card.onclick = function () { selectTarget(p, null); };
      each(p.worktrees, function (wt) {
        var row = el('button', 'wtrow', '\\u2387 ' + wt.branch + (wt.active ? ' \\u00b7 active' : ''));
        row.onclick = function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          selectTarget(p, wt);
          return false;
        };
        card.appendChild(row);
      });
      list.appendChild(card);
    });
  }

  // ── terminal: minimal VT100 screen model ─────────────────────────────
  // Renders into a <pre> via innerHTML. Supports the sequences interactive
  // programs lean on: cursor addressing, erase, scroll regions, insert /
  // delete lines and chars, SGR colors (16 / 256 / RGB), and the alt screen.
  var PAL = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fc0',
    '#11a8cd', '#e5e5e5', '#666666', '#f14c4c', '#23d18b', '#f5f543',
    '#3b8eea', '#d670d6', '#29b8db', '#ffffff'];
  var CUBE = [0, 95, 135, 175, 215, 255];
  function pal256(n) {
    n = n | 0;
    if (n < 0) n = 0;
    if (n > 255) n = 255;
    if (n < 16) return PAL[n];
    if (n < 232) {
      n -= 16;
      return 'rgb(' + CUBE[Math.floor(n / 36)] + ',' + CUBE[Math.floor(n / 6) % 6] + ',' + CUBE[n % 6] + ')';
    }
    var v = 8 + (n - 232) * 10;
    return 'rgb(' + v + ',' + v + ',' + v + ')';
  }
  var DEF_FG = '#e9edf7';
  var DEF_BG = '#000000';
  var BLANK = { c: ' ', fg: -1, bg: -1, b: 0, u: 0, inv: 0 };

  function Term(container) {
    this.el = container;
    this.cols = 80;
    this.rows = 24;
    this.pending = false;
    this.resetAll();
  }
  Term.prototype.blankRow = function () {
    var r = [];
    for (var i = 0; i < this.cols; i++) r.push(BLANK);
    return r;
  };
  Term.prototype.resetAll = function () {
    this.buf = [];
    for (var y = 0; y < this.rows; y++) this.buf.push(this.blankRow());
    this.sb = [];          // scrollback (pre-rendered HTML rows)
    this.x = 0; this.y = 0;
    this.sx = 0; this.sy = 0;
    this.top = 0; this.bot = this.rows - 1;
    this.at = { fg: -1, bg: -1, b: 0, u: 0, inv: 0 };
    this.alt = false;
    this.savedMain = null;
    this.st = 0; this.ps = '';
    this.touch();
  };
  Term.prototype.resize = function (cols, rows) {
    if (cols < 2 || rows < 2 || (cols === this.cols && rows === this.rows)) return;
    var y, row;
    for (y = 0; y < this.buf.length; y++) {
      row = this.buf[y];
      while (row.length < cols) row.push(BLANK);
      if (row.length > cols) row.length = cols;
    }
    this.cols = cols;
    while (this.buf.length < rows) this.buf.push(this.blankRow());
    if (this.buf.length > rows) this.buf.length = rows;
    this.rows = rows;
    this.top = 0; this.bot = rows - 1;
    if (this.x > cols) this.x = cols;
    if (this.y > rows - 1) this.y = rows - 1;
    this.touch();
  };
  Term.prototype.cell = function (ch) {
    var a = this.at;
    if (a.fg === -1 && a.bg === -1 && !a.b && !a.u && !a.inv && ch === ' ') return BLANK;
    return { c: ch, fg: a.fg, bg: a.bg, b: a.b, u: a.u, inv: a.inv };
  };
  Term.prototype.put = function (ch) {
    if (this.x >= this.cols) { this.x = 0; this.lf(); } // deferred wrap
    this.buf[this.y][this.x] = this.cell(ch);
    this.x++;
  };
  Term.prototype.lf = function () {
    if (this.y === this.bot) this.scrollUp(1);
    else if (this.y < this.rows - 1) this.y++;
  };
  Term.prototype.ri = function () {
    if (this.y === this.top) this.scrollDown(1);
    else if (this.y > 0) this.y--;
  };
  Term.prototype.scrollUp = function (n) {
    for (var i = 0; i < n; i++) {
      var row = this.buf.splice(this.top, 1)[0];
      if (this.top === 0 && !this.alt) {
        this.sb.push(this.renderRow(row, -1));
        if (this.sb.length > 200) this.sb.shift();
      }
      this.buf.splice(this.bot, 0, this.blankRow());
    }
  };
  Term.prototype.scrollDown = function (n) {
    for (var i = 0; i < n; i++) {
      this.buf.splice(this.bot, 1);
      this.buf.splice(this.top, 0, this.blankRow());
    }
  };
  Term.prototype.clearRange = function (y, x0, x1) {
    var row = this.buf[y];
    for (var x = x0; x < x1 && x < this.cols; x++) row[x] = BLANK;
  };
  Term.prototype.write = function (str) {
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var code = str.charCodeAt(i);
      switch (this.st) {
        case 0:
          if (code === 27) this.st = 1;
          else if (code === 13) this.x = 0;
          else if (code === 10) this.lf();
          else if (code === 8) { if (this.x > 0) this.x--; }
          else if (code === 9) this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8);
          else if (code >= 32) this.put(ch);
          break;
        case 1: // got ESC
          if (ch === '[') { this.st = 2; this.ps = ''; }
          else if (ch === ']') { this.st = 3; }
          else if (ch === '(' || ch === ')' || ch === '#' || ch === '%') this.st = 4;
          else {
            if (ch === '7') { this.sx = this.x; this.sy = this.y; }
            else if (ch === '8') { this.x = this.sx; this.y = this.sy; }
            else if (ch === 'M') this.ri();
            else if (ch === 'D') this.lf();
            else if (ch === 'E') { this.x = 0; this.lf(); }
            else if (ch === 'c') this.resetAll();
            this.st = 0;
          }
          break;
        case 2: // CSI params
          if ((code >= 48 && code <= 63) || code === 32 || code === 33 || code === 34 || code === 39) this.ps += ch;
          else { this.csi(ch, this.ps); this.st = 0; }
          break;
        case 3: // OSC — swallow until BEL or ESC-backslash
          if (code === 7) this.st = 0;
          else if (code === 27) this.st = 5;
          break;
        case 4: this.st = 0; break; // charset designator argument
        case 5: this.st = 0; break; // ST terminator after OSC
      }
    }
    this.touch();
  };
  Term.prototype.csi = function (f, ps) {
    var priv = ps.length > 0 && ps.charAt(0) === '?';
    if (priv) ps = ps.slice(1);
    var parts = ps.split(';');
    var p = [];
    for (var i = 0; i < parts.length; i++) p.push(parseInt(parts[i], 10) || 0);
    var n = Math.max(1, p[0]);
    var row, j;
    switch (f) {
      case 'A': this.y = Math.max(this.top, this.y - n); break;
      case 'B': this.y = Math.min(this.bot, this.y + n); break;
      case 'C': this.x = Math.min(this.cols - 1, this.x + n); break;
      case 'D': this.x = Math.max(0, this.x - n); break;
      case 'E': this.x = 0; this.y = Math.min(this.bot, this.y + n); break;
      case 'F': this.x = 0; this.y = Math.max(this.top, this.y - n); break;
      case 'G': this.x = Math.min(this.cols - 1, Math.max(0, n - 1)); break;
      case 'd': this.y = Math.min(this.rows - 1, Math.max(0, n - 1)); break;
      case 'H': case 'f':
        this.y = Math.min(this.rows - 1, Math.max(0, (p[0] || 1) - 1));
        this.x = Math.min(this.cols - 1, Math.max(0, (p[1] || 1) - 1));
        break;
      case 'J':
        if (p[0] === 0) {
          this.clearRange(this.y, this.x, this.cols);
          for (j = this.y + 1; j < this.rows; j++) this.buf[j] = this.blankRow();
        } else if (p[0] === 1) {
          this.clearRange(this.y, 0, this.x + 1);
          for (j = 0; j < this.y; j++) this.buf[j] = this.blankRow();
        } else {
          for (j = 0; j < this.rows; j++) this.buf[j] = this.blankRow();
          if (p[0] === 3) this.sb = [];
        }
        break;
      case 'K':
        if (p[0] === 0) this.clearRange(this.y, this.x, this.cols);
        else if (p[0] === 1) this.clearRange(this.y, 0, this.x + 1);
        else this.buf[this.y] = this.blankRow();
        break;
      case 'L':
        if (this.y >= this.top && this.y <= this.bot) {
          for (j = 0; j < n; j++) {
            this.buf.splice(this.bot, 1);
            this.buf.splice(this.y, 0, this.blankRow());
          }
        }
        break;
      case 'M':
        if (this.y >= this.top && this.y <= this.bot) {
          for (j = 0; j < n; j++) {
            this.buf.splice(this.y, 1);
            this.buf.splice(this.bot, 0, this.blankRow());
          }
        }
        break;
      case 'P':
        row = this.buf[this.y];
        row.splice(this.x, n);
        while (row.length < this.cols) row.push(BLANK);
        break;
      case '@':
        row = this.buf[this.y];
        for (j = 0; j < n; j++) row.splice(this.x, 0, BLANK);
        row.length = this.cols;
        break;
      case 'X': this.clearRange(this.y, this.x, this.x + n); break;
      case 'S': this.scrollUp(n); break;
      case 'T': this.scrollDown(n); break;
      case 'r':
        this.top = Math.max(0, (p[0] || 1) - 1);
        this.bot = Math.min(this.rows - 1, (p[1] || this.rows) - 1);
        if (this.top >= this.bot) { this.top = 0; this.bot = this.rows - 1; }
        this.x = 0; this.y = this.top;
        break;
      case 's': this.sx = this.x; this.sy = this.y; break;
      case 'u': this.x = this.sx; this.y = this.sy; break;
      case 'h': case 'l':
        if (priv && (p[0] === 1049 || p[0] === 1047 || p[0] === 47)) {
          if (f === 'h') {
            if (!this.alt) {
              var copy = [];
              for (j = 0; j < this.buf.length; j++) copy.push(this.buf[j].slice());
              this.savedMain = { buf: copy, x: this.x, y: this.y };
            }
            this.alt = true;
            for (j = 0; j < this.rows; j++) this.buf[j] = this.blankRow();
            this.x = 0; this.y = 0;
          } else if (this.alt) {
            this.alt = false;
            if (this.savedMain) {
              this.buf = this.savedMain.buf;
              this.x = this.savedMain.x; this.y = this.savedMain.y;
              this.savedMain = null;
              this.resize(this.cols, this.rows); // re-pad after restore
            }
          }
        }
        break;
      case 'm': this.sgr(p); break;
      // n (DSR), t, c (DA) — queries we silently drop.
    }
  };
  Term.prototype.sgr = function (p) {
    if (p.length === 0) p = [0];
    var a = this.at;
    for (var i = 0; i < p.length; i++) {
      var v = p[i];
      if (v === 0) { a.fg = -1; a.bg = -1; a.b = 0; a.u = 0; a.inv = 0; }
      else if (v === 1) a.b = 1;
      else if (v === 4) a.u = 1;
      else if (v === 7) a.inv = 1;
      else if (v === 21 || v === 22) a.b = 0;
      else if (v === 24) a.u = 0;
      else if (v === 27) a.inv = 0;
      else if (v >= 30 && v <= 37) a.fg = PAL[v - 30];
      else if (v === 38 && p[i + 1] === 5) { a.fg = pal256(p[i + 2]); i += 2; }
      else if (v === 38 && p[i + 1] === 2) { a.fg = 'rgb(' + (p[i + 2] | 0) + ',' + (p[i + 3] | 0) + ',' + (p[i + 4] | 0) + ')'; i += 4; }
      else if (v === 39) a.fg = -1;
      else if (v >= 40 && v <= 47) a.bg = PAL[v - 40];
      else if (v === 48 && p[i + 1] === 5) { a.bg = pal256(p[i + 2]); i += 2; }
      else if (v === 48 && p[i + 1] === 2) { a.bg = 'rgb(' + (p[i + 2] | 0) + ',' + (p[i + 3] | 0) + ',' + (p[i + 4] | 0) + ')'; i += 4; }
      else if (v === 49) a.bg = -1;
      else if (v >= 90 && v <= 97) a.fg = PAL[v - 82];
      else if (v >= 100 && v <= 107) a.bg = PAL[v - 92];
    }
  };
  Term.prototype.renderRow = function (row, cursorX) {
    var out = '';
    var run = '';
    var key = null;
    function cellKey(c, inverted) {
      if (!inverted && c.fg === -1 && c.bg === -1 && !c.b && !c.u && !c.inv) return '';
      var fg = c.fg === -1 ? DEF_FG : c.fg;
      var bg = c.bg === -1 ? DEF_BG : c.bg;
      if ((c.inv ? 1 : 0) !== (inverted ? 1 : 0)) { var t = fg; fg = bg; bg = t; } // XOR of cell+cursor inverse
      var s = 'color:' + fg + ';';
      if (bg !== DEF_BG || c.inv || inverted) s += 'background:' + bg + ';';
      if (c.b) s += 'font-weight:bold;';
      if (c.u) s += 'text-decoration:underline;';
      return s;
    }
    function flush() {
      if (!run) return;
      out += key ? '<span style="' + key + '">' + escHtml(run) + '</span>' : escHtml(run);
      run = '';
    }
    // Trim trailing default-blank cells to keep innerHTML small.
    var last = row.length - 1;
    while (last >= 0 && row[last] === BLANK && last !== cursorX) last--;
    for (var x = 0; x <= last; x++) {
      var c = row[x];
      var k = cellKey(c, x === cursorX);
      if (k !== key) { flush(); key = k; }
      run += c.c;
    }
    flush();
    if (cursorX > last) {
      // Cursor sits past the text — paint a block there.
      while (last < cursorX - 1) { out += ' '; last++; }
      out += '<span style="color:' + DEF_BG + ';background:' + DEF_FG + ';"> </span>';
    }
    return out;
  };
  Term.prototype.touch = function () {
    if (this.pending) return;
    this.pending = true;
    var self = this;
    setTimeout(function () { self.pending = false; self.render(); }, 33);
  };
  Term.prototype.render = function () {
    var lines = this.sb.slice();
    for (var y = 0; y < this.rows; y++) {
      lines.push(this.renderRow(this.buf[y], y === this.y ? Math.min(this.x, this.cols - 1) : -1));
    }
    this.el.innerHTML = lines.join('\\n');
    this.el.scrollTop = this.el.scrollHeight;
  };

  var term = new Term($('term'));

  // ── terminal sizing ──────────────────────────────────────────────────
  function measureChar() {
    var s = document.createElement('span');
    s.appendChild(document.createTextNode('XXXXXXXXXX'));
    s.style.visibility = 'hidden';
    $('term').appendChild(s);
    var w = s.offsetWidth / 10;
    var h = s.offsetHeight;
    $('term').removeChild(s);
    return { w: w || 7.2, h: h || 15 };
  }
  function layoutTerm() {
    var t = $('term');
    if (state.screen !== 'workspace' || t.className === 'hidden') return;
    var h;
    if (document.body.className === 'termfull') {
      // Fullscreen: fill the viewport (minus the 4px padding on each side).
      h = window.innerHeight - 8;
    } else {
      var rect = t.getBoundingClientRect();
      // Leave room for the tab bar (52) plus a little breathing space.
      h = window.innerHeight - rect.top - 60;
    }
    if (h < 120) h = 120;
    t.style.height = h + 'px';
    var m = measureChar();
    var cols = Math.floor((t.clientWidth - 8) / m.w);
    var rows = Math.floor((h - 8) / m.h);
    if (cols < 20) cols = 20;
    if (rows < 5) rows = 5;
    term.resize(cols, rows);
    if (ws && ws.readyState === 1 && state.attachedKey) {
      ws.send(JSON.stringify({ type: 'resize', cols: cols, rows: rows }));
    }
  }
  var resizeTimer = null;
  window.onresize = function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutTerm, 150);
  };

  // ── base64 / UTF-8 plumbing ──────────────────────────────────────────
  var pendBytes = ''; // partial UTF-8 sequence carried across WS frames
  function decodeChunk(b64) {
    var bin;
    try { bin = atob(b64); } catch (e) { return ''; }
    bin = pendBytes + bin;
    pendBytes = '';
    for (var k = 0; k < 4; k++) {
      try { return decodeURIComponent(escape(bin)); }
      catch (err) {
        if (bin.length === 0) break;
        pendBytes = bin.charAt(bin.length - 1) + pendBytes;
        bin = bin.slice(0, -1);
      }
    }
    var raw = bin + pendBytes; // not valid UTF-8 — pass through as latin1
    pendBytes = '';
    return raw;
  }
  function b64encode(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }

  // ── websocket ────────────────────────────────────────────────────────
  var ws = null;
  function connect() {
    if (!window.WebSocket) {
      $('setConn').innerHTML = 'No WebSocket support';
      return;
    }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = function () {
      $('setConn').innerHTML = 'Connected';
      if (state.current && state.current.sessionKey) attachTo(state.current.sessionKey);
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'attached') {
        state.attachedKey = msg.key;
        pendBytes = '';
        term.resetAll();
        layoutTerm();
      } else if (msg.type === 'data') {
        term.write(decodeChunk(msg.data));
      } else if (msg.type === 'error') {
        toast(msg.message || 'session error');
      }
    };
    ws.onclose = function () {
      state.attachedKey = null;
      $('setConn').innerHTML = 'Reconnecting\\u2026';
      setTimeout(connect, 1500);
    };
  }
  function attachTo(key) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'attach', key: key, cols: term.cols, rows: term.rows }));
  }
  function sendInput(s) {
    if (ws && ws.readyState === 1 && state.attachedKey) {
      ws.send(JSON.stringify({ type: 'input', data: b64encode(s) }));
    }
  }

  // Direct typing (BB10 physical keyboards). With no editable element focused
  // the BB10 browser treats letter keys as page shortcuts; capture them while
  // the terminal pane is showing and feed the pty instead.
  function termHasKeyboard() {
    if (state.screen !== 'workspace' || wsPane !== 'term' || !state.attachedKey) return false;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return false;
    return true;
  }
  var KEYSEQ = {
    8: String.fromCharCode(127), 9: String.fromCharCode(9),
    13: String.fromCharCode(13), 27: ESC,
    33: ESC + '[5~', 34: ESC + '[6~', 35: ESC + '[F', 36: ESC + '[H',
    37: ESC + '[D', 38: ESC + '[A', 39: ESC + '[C', 40: ESC + '[B',
    46: ESC + '[3~',
  };
  document.addEventListener('keydown', function (e) {
    if (!termHasKeyboard()) return;
    var code = e.keyCode || e.which;
    var seq = KEYSEQ[code];
    if (e.ctrlKey && code >= 65 && code <= 90) seq = String.fromCharCode(code - 64); // ^A..^Z
    if (seq) {
      sendInput(seq);
      if (e.preventDefault) e.preventDefault();
    }
  }, false);
  document.addEventListener('keypress', function (e) {
    if (!termHasKeyboard()) return;
    var ch = e.charCode || e.which;
    // Enter (13) is already sent from keydown; skip modifier chords.
    if (ch && ch !== 13 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      sendInput(String.fromCharCode(ch));
      if (e.preventDefault) e.preventDefault();
    }
  }, false);
  // Tapping the terminal toggles fullscreen and drops focus from any other
  // input so the physical keyboard types straight into the session.
  function setTermFull(on) {
    document.body.className = on ? 'termfull' : '';
    setTimeout(layoutTerm, 0);
  }
  $('term').onclick = function () {
    var a = document.activeElement;
    if (a && a.blur) a.blur();
    setTermFull(document.body.className !== 'termfull');
  };

  // ── workspace panes ──────────────────────────────────────────────────
  var wsPane = 'term';
  function setPane(name) {
    wsPane = name;
    $('segTerm').className = name === 'term' ? 'on' : '';
    $('segFiles').className = name === 'files' ? 'on' : '';
    $('pane-term').className = name === 'term' ? '' : 'hidden';
    $('pane-files').className = name === 'files' ? '' : 'hidden';
    if (name === 'term') setTimeout(layoutTerm, 0);
    if (name === 'files') loadFiles();
  }
  $('segTerm').onclick = function () { setPane('term'); };
  $('segFiles').onclick = function () { setPane('files'); };

  function enterWorkspace() {
    var c = state.current;
    $('wsTitle').innerHTML = '';
    $('wsTitle').appendChild(document.createTextNode(c ? c.name : 'Workspace'));
    $('wsBranch').innerHTML = '';
    $('wsBranch').appendChild(document.createTextNode(c && c.branch ? c.branch : '\\u2014'));
    var hasSession = !!(c && c.sessionKey);
    $('term').className = hasSession ? '' : 'hidden';
    $('wsEmpty').className = hasSession ? 'empty hidden' : 'empty';
    if (hasSession && state.attachedKey !== c.sessionKey) attachTo(c.sessionKey);
    setPane(wsPane);
  }

  // ── files ────────────────────────────────────────────────────────────
  function targetQS() {
    var c = state.current;
    if (!c) return null;
    var qs = 'projectId=' + encodeURIComponent(c.projectId);
    if (c.worktreeId) qs += '&worktreeId=' + encodeURIComponent(c.worktreeId);
    return qs;
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function loadFiles() {
    var qs = targetQS();
    var list = $('fileList');
    $('fileView').className = 'fileview hidden';
    list.className = 'filelist';
    list.innerHTML = '';
    renderCrumbs();
    if (!qs) {
      list.appendChild(el('div', 'empty', 'Select a project first.'));
      return;
    }
    getJSON('/api/files?' + qs + '&path=' + encodeURIComponent(state.filePath), function (r) {
      if (!r || !r.ok) { list.appendChild(el('div', 'empty', (r && r.error) || 'Failed to list files.')); return; }
      if (r.entries.length === 0) { list.appendChild(el('div', 'empty', 'Empty directory.')); return; }
      each(r.entries, function (ent) {
        var row = el('button', 'frow' + (ent.dir ? ' dir' : ''));
        if (!ent.dir) row.appendChild(el('span', 'sz', fmtSize(ent.size)));
        row.appendChild(el('span', 'ic', ent.dir ? '\\u25b8' : '\\u00b7'));
        row.appendChild(document.createTextNode(ent.name));
        row.onclick = function () {
          var next = state.filePath ? state.filePath + '/' + ent.name : ent.name;
          if (ent.dir) { state.filePath = next; loadFiles(); }
          else openFile(next);
        };
        list.appendChild(row);
      });
    });
  }
  function renderCrumbs() {
    var c = $('crumbs');
    c.innerHTML = '';
    var root = el('button', '', state.current ? state.current.name : 'root');
    root.onclick = function () { state.filePath = ''; loadFiles(); };
    c.appendChild(root);
    if (!state.filePath) return;
    var parts = state.filePath.split('/');
    var acc = '';
    each(parts, function (part) {
      acc = acc ? acc + '/' + part : part;
      c.appendChild(el('span', 'sep', ' / '));
      var b = el('button', '', part);
      var target = acc;
      b.onclick = function () { state.filePath = target; loadFiles(); };
      c.appendChild(b);
    });
  }
  function openFile(rel) {
    var qs = targetQS();
    if (!qs) return;
    getJSON('/api/file?' + qs + '&path=' + encodeURIComponent(rel), function (r) {
      if (!r || !r.ok) { toast((r && r.error) || 'Failed to open file.'); return; }
      $('fileList').className = 'filelist hidden';
      $('fileView').className = 'fileview';
      var crumbs = $('crumbs');
      crumbs.innerHTML = '';
      var back = el('button', '', '\\u2039 Back');
      back.onclick = loadFiles;
      crumbs.appendChild(back);
      crumbs.appendChild(el('span', 'sep', ' / ' + rel));
      var fv = $('fileView');
      fv.innerHTML = '';
      fv.appendChild(document.createTextNode(r.binary
        ? '[binary file]'
        : r.content + (r.truncated ? '\\n\\n[truncated]' : '')));
    });
  }

  // ── git ──────────────────────────────────────────────────────────────
  var CHANGE_BADGE = {
    added: 'A', modified: 'M', deleted: 'D', renamed: 'M', copied: 'A',
    typechange: 'M', untracked: 'U', ignored: 'U', conflicted: 'M',
  };
  function loadGit() {
    var c = state.current;
    $('gitTitle').innerHTML = '';
    $('gitTitle').appendChild(document.createTextNode(c ? 'Git \\u00b7 ' + c.name : 'Git'));
    if (!c) {
      $('gitBranch').innerHTML = '\\u2014';
      $('gitAB').innerHTML = '';
      renderGitLists(null);
      return;
    }
    getJSON('/api/git/status?' + targetQS(), function (r) {
      if (!r || !r.ok) {
        $('gitBranch').innerHTML = '\\u2014';
        $('gitAB').innerHTML = '';
        renderGitLists(null);
        toast((r && r.error) || 'Not a git repository.');
        return;
      }
      state.gitStatus = r.status;
      $('gitBranch').innerHTML = '';
      $('gitBranch').appendChild(document.createTextNode(
        r.status.branch || (r.status.detached ? 'detached' : '\\u2014')));
      var ab = $('gitAB');
      ab.innerHTML = '';
      if (r.status.ahead) ab.appendChild(el('span', 'up', '\\u2191' + r.status.ahead + ' '));
      if (r.status.behind) ab.appendChild(el('span', 'down', '\\u2193' + r.status.behind));
      renderGitLists(r.status);
    });
  }
  $('gitRefresh').onclick = loadGit;

  function targetBody() {
    var c = state.current;
    return { projectId: c.projectId, worktreeId: c.worktreeId };
  }
  function gitRow(f, staged) {
    var row = el('button', 'grow');
    var act = el('span', 'act', staged ? '\\u2212' : '+');
    act.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var body = targetBody();
      body.paths = [f.path];
      postJSON(staged ? '/api/git/unstage' : '/api/git/stage', body, function (r) {
        if (!r || !r.ok) toast((r && r.error) || 'git failed');
        loadGit();
      });
      return false;
    };
    row.appendChild(act);
    row.appendChild(el('span', 'badge ' + (CHANGE_BADGE[f.change] || 'M'), CHANGE_BADGE[f.change] || 'M'));
    row.appendChild(document.createTextNode(f.path));
    row.onclick = function () { showDiff(f); };
    return row;
  }
  function renderGitLists(status) {
    var sl = $('stagedList');
    var ul = $('unstagedList');
    sl.innerHTML = '';
    ul.innerHTML = '';
    $('diffBox').className = 'diffbox hidden';
    var files = status ? status.files : [];
    var staged = [];
    var unstaged = [];
    each(files, function (f) { (f.stage === 'staged' ? staged : unstaged).push(f); });
    $('stagedCnt').innerHTML = String(staged.length);
    $('unstagedCnt').innerHTML = String(unstaged.length);
    if (staged.length === 0) sl.appendChild(el('div', 'empty', status ? 'Nothing staged.' : 'Select a project first.'));
    each(staged, function (f) { sl.appendChild(gitRow(f, true)); });
    if (unstaged.length === 0) ul.appendChild(el('div', 'empty', status ? 'Working tree clean.' : 'Select a project first.'));
    each(unstaged, function (f) { ul.appendChild(gitRow(f, false)); });
    updateCommitBtn();
  }
  function showDiff(f) {
    var qs = targetQS();
    if (!qs) return;
    getJSON('/api/git/diff?' + qs +
      '&path=' + encodeURIComponent(f.path) +
      '&stage=' + encodeURIComponent(f.stage), function (r) {
      if (!r || !r.ok) { toast((r && r.error) || 'diff failed'); return; }
      $('diffPath').innerHTML = '';
      $('diffPath').appendChild(document.createTextNode(f.path));
      var pre = $('diffPre');
      pre.innerHTML = '';
      if (r.binary) {
        pre.appendChild(el('div', 'dl-meta', '[binary file]'));
      } else {
        var lines = r.diff.split('\\n');
        each(lines, function (line) {
          var cls = '';
          var c3 = line.slice(0, 3);
          if (c3 === '+++' || c3 === '---' || line.slice(0, 5) === 'diff ' || line.slice(0, 6) === 'index ') cls = 'dl-meta';
          else if (line.slice(0, 2) === '@@') cls = 'dl-hunk';
          else if (line.charAt(0) === '+') cls = 'dl-add';
          else if (line.charAt(0) === '-') cls = 'dl-del';
          pre.appendChild(el('div', cls, line.length ? line : ' '));
        });
      }
      $('diffBox').className = 'diffbox';
    });
  }
  $('diffClose').onclick = function () { $('diffBox').className = 'diffbox hidden'; };

  function updateCommitBtn() {
    var stagedCount = 0;
    if (state.gitStatus) {
      each(state.gitStatus.files, function (f) { if (f.stage === 'staged') stagedCount++; });
    }
    $('commitBtn').disabled = !(stagedCount > 0 && $('commitMsg').value.replace(/^\\s+|\\s+$/g, '').length > 0);
  }
  $('commitMsg').oninput = updateCommitBtn;
  $('commitMsg').onkeyup = updateCommitBtn; // BB10 oninput can be flaky
  $('commitBtn').onclick = function () {
    var subject = $('commitMsg').value.replace(/^\\s+|\\s+$/g, '');
    if (!subject || !state.current) return;
    $('commitBtn').disabled = true;
    var body = targetBody();
    body.subject = subject;
    postJSON('/api/git/commit', body, function (r) {
      if (r && r.ok) {
        $('commitMsg').value = '';
        toast('Committed.');
      } else {
        toast((r && r.error) || 'commit failed');
      }
      loadGit();
    });
  };

  // ── settings ─────────────────────────────────────────────────────────
  $('setHost').appendChild(document.createTextNode(location.host));

  // ── boot ─────────────────────────────────────────────────────────────
  connect();
  loadProjects();
  layoutTerm();
})();
</script>
</body>
</html>`;
