// Embedded HTML for the Dash LAN web UI. Kept as template-literal strings so
// the web server stays dependency- and build-step-free. The client script
// deliberately avoids backticks and `${` so it survives embedding in a TS
// template literal.
//
// Screens: Projects (registry + live sessions), Workspace (terminal + files),
// Git (status / stage / diff / commit), Settings. Near-black + indigo palette
// mirroring the desktop app's design tokens (accent #5e6ad2).

export const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dash — sign in</title>
<style>
  /* Literal-value declarations come before every var()/grid/min() use so the
     page stays usable on legacy WebKit (BlackBerry 10) that ignores them. */
  :root { color-scheme: dark;
    --bg:#0b0b0c; --surface:#131316; --border:#26262c; --fg:#e9e9ee;
    --muted:#9a9aa3; --accent:#5e6ad2; --accent-fg:#ffffff; --red:#e06c6c; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #0b0b0c; background: var(--bg);
    color: #e9e9ee; color: var(--fg);
    font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: grid; place-items: center;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  form {
    background: #131316; background: var(--surface);
    border: 1px solid #26262c; border: 1px solid var(--border); border-radius: 16px;
    padding: 28px; box-sizing: border-box;
    margin: 48px auto; /* horizontal centering fallback; grid recenters it */
    width: 90%; max-width: 360px; width: min(360px, 90vw);
  }
  .logo {
    width: 44px; height: 44px; border-radius: 10px;
    background: #5e6ad2; background: var(--accent);
    color: #ffffff; color: var(--accent-fg);
    text-align: center; line-height: 44px;
    display: grid; place-items: center;
    font: 800 22px ui-monospace, Menlo, monospace; letter-spacing: -1px;
    margin-bottom: 16px;
  }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 700; }
  p.sub { margin: 0 0 16px; color: #9a9aa3; color: var(--muted); font-size: 13px; }
  p.err { color: #e06c6c; color: var(--red); margin: 0 0 12px; font-size: 13px; min-height: 1em; }
  input[type=password] {
    width: 100%; box-sizing: border-box;
    padding: 12px 14px; font-size: 16px;
    background: #0b0b0c; background: var(--bg);
    color: #e9e9ee; color: var(--fg);
    border: 1px solid #26262c; border: 1px solid var(--border); border-radius: 10px;
    outline: none;
  }
  input[type=password]:focus { border-color: #5e6ad2; border-color: var(--accent); }
  button {
    margin-top: 14px; width: 100%; padding: 13px;
    background: #5e6ad2; background: var(--accent);
    color: #ffffff; color: var(--accent-fg); border: 0; border-radius: 10px;
    font-size: 16px; font-weight: 700;
  }
</style>
</head>
<body>
<form method="post" action="/login">
  <div class="logo">D_</div>
  <h1>Dash</h1>
  <p class="sub">Your projects. Your workspace. From anywhere.</p>
  <p class="err">{{ERROR}}</p>
  <input name="password" type="password" placeholder="Password" autofocus autocomplete="current-password">
  <button type="submit">Sign in</button>
</form>
</body>
</html>`;

export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>Dash</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
<style>
  :root { color-scheme: dark;
    --bg:#0b0b0c; --surface:#131316; --surface2:#1e1e24;
    --border:#26262c; --border2:#34343c;
    --fg:#e9e9ee; --muted:#9a9aa3; --subtle:#6e6e78;
    --accent:#5e6ad2; --accent-fg:#ffffff;
    --green:#5fb88a; --red:#e06c6c; --orange:#d9a55b; --blue:#7aa2ff;
  }
  * { -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg);
    font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    overscroll-behavior: none; }
  body { position: fixed; inset: 0; display: flex; flex-direction: column;
    height: var(--app-h, 100dvh); width: 100%; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  .hidden { display: none !important; }

  main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .screen { flex: 1; min-height: 0; display: none; flex-direction: column; }
  .screen.on { display: flex; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }

  /* ── Header ── */
  .ph { display: flex; align-items: center; gap: 10px; padding: 12px 16px 8px;
    padding-top: calc(12px + env(safe-area-inset-top)); }
  .ph .logo { width: 30px; height: 30px; border-radius: 8px; flex: 0 0 auto;
    background: var(--accent); color: var(--accent-fg);
    display: grid; place-items: center;
    font: 800 15px ui-monospace, Menlo, monospace; letter-spacing: -1px; }
  .ph-title { flex: 1; font-size: 19px; font-weight: 700;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .iconbtn { width: 36px; height: 36px; flex: 0 0 auto; border-radius: 9px;
    display: grid; place-items: center; color: var(--muted);
    background: var(--surface); border: 1px solid var(--border); }
  .iconbtn:active { background: var(--surface2); }
  .iconbtn svg { width: 17px; height: 17px; }
  .backbtn { width: 32px; height: 36px; display: grid; place-items: center; color: var(--fg);
    margin-left: -8px; }
  .backbtn svg { width: 20px; height: 20px; }

  /* ── Projects ── */
  .search { margin: 4px 16px 10px; display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 9px 12px; color: var(--subtle); }
  .search svg { width: 15px; height: 15px; flex: 0 0 auto; }
  .search input { flex: 1; background: none; border: 0; outline: none; color: var(--fg);
    font-size: 15px; min-width: 0; }
  .search input::placeholder { color: var(--subtle); }
  .cards { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 13px 14px; }
  .card:active { background: var(--surface2); }
  .card-top { display: flex; align-items: center; gap: 10px; }
  .ficon { width: 32px; height: 32px; border-radius: 8px; flex: 0 0 auto;
    background: rgba(255,214,10,0.12); color: var(--accent);
    display: grid; place-items: center; }
  .ficon svg { width: 16px; height: 16px; }
  .card-name { flex: 1; min-width: 0; font-weight: 600; font-size: 15px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted);
    flex: 0 0 auto; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--subtle); }
  .dot.on { background: var(--green); }
  .card-sub { margin: 4px 0 0 42px; color: var(--subtle); font-size: 12px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-bottom { margin: 8px 0 0 42px; display: flex; align-items: center; gap: 12px;
    color: var(--muted); font-size: 12px; }
  .card-bottom .branch { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .card-bottom .branch svg { width: 12px; height: 12px; }
  .wtrow { margin: 8px 0 0 42px; padding: 8px 10px; display: flex; align-items: center; gap: 8px;
    background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
    color: var(--muted); font-size: 12.5px; }
  .wtrow svg { width: 12px; height: 12px; flex: 0 0 auto; }
  .wtrow .b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--fg); }
  .empty { padding: 28px 16px; color: var(--subtle); font-size: 13px; text-align: center; }

  /* ── Workspace ── */
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    font-size: 12px; color: var(--muted); flex: 0 0 auto; max-width: 40vw; }
  .chip svg { width: 11px; height: 11px; flex: 0 0 auto; }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg { display: flex; gap: 4px; margin: 2px 16px 8px; padding: 3px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 11px; }
  .seg button { flex: 1; padding: 7px 0; border-radius: 8px; font-size: 13px; font-weight: 600;
    color: var(--muted); }
  .seg button.on { background: var(--surface2); color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--border2); }
  .pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  #term { flex: 1; min-height: 0; background: #000; margin: 0 0 0 0; }
  #term .xterm { height: 100%; padding: 4px; }
  .softrow { display: flex; gap: 6px; padding: 6px 8px; background: var(--surface);
    border-top: 1px solid var(--border); overflow-x: auto; }
  .softrow button { flex: 0 0 auto; padding: 9px 12px; min-width: 44px; min-height: 38px;
    background: var(--surface2); color: var(--fg); border: 1px solid var(--border);
    border-radius: 9px; font-size: 13px; font-weight: 500; }
  .softrow button:active { background: var(--border2); }
  .ws-empty { flex: 1; display: grid; place-items: center; padding: 24px; }
  .ws-empty div { text-align: center; color: var(--subtle); font-size: 13px; max-width: 260px;
    line-height: 1.5; }

  /* ── Files ── */
  .crumbs { display: flex; align-items: center; gap: 2px; padding: 2px 16px 8px;
    overflow-x: auto; white-space: nowrap; font-size: 12.5px; color: var(--subtle); }
  .crumbs button { color: var(--blue); padding: 4px 2px; font-size: 12.5px; }
  .crumbs .sep { color: var(--subtle); }
  .filelist { padding: 0 16px 16px; }
  .frow { display: flex; align-items: center; gap: 10px; padding: 11px 12px;
    border-bottom: 1px solid var(--border); font-size: 14px; width: 100%; text-align: left; }
  .frow:active { background: var(--surface); }
  .frow svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--muted); }
  .frow.dir svg { color: var(--accent); }
  .frow .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .frow .sz { color: var(--subtle); font-size: 11.5px; flex: 0 0 auto; }
  .fileview { flex: 1; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch;
    margin: 0 16px 16px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; }
  .fileview pre { margin: 0; padding: 12px; font: 12px ui-monospace, Menlo, Monaco, monospace;
    color: var(--fg); white-space: pre; }

  /* ── Git ── */
  .gitbar { display: flex; align-items: center; gap: 8px; margin: 2px 16px 10px; }
  .gitbranch { flex: 1; display: flex; align-items: center; gap: 7px; min-width: 0;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 9px 12px; font-size: 13.5px; }
  .gitbranch svg { width: 13px; height: 13px; color: var(--muted); flex: 0 0 auto; }
  .gitbranch .b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; }
  .ab { display: flex; align-items: center; gap: 8px; font-size: 12.5px; flex: 0 0 auto; }
  .ab .up { color: var(--green); } .ab .down { color: var(--orange); }
  .gsec { margin: 0 16px 12px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 13px; overflow: hidden; }
  .gsec-h { display: flex; align-items: center; padding: 11px 13px;
    border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13.5px; }
  .gsec-h .cnt { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px;
    border-radius: 999px; background: var(--surface2); color: var(--muted);
    display: grid; place-items: center; font-size: 11.5px; font-weight: 600; }
  .grow { display: flex; align-items: center; gap: 9px; padding: 10px 13px;
    border-bottom: 1px solid var(--border); width: 100%; text-align: left; font-size: 13px; }
  .grow:last-child { border-bottom: 0; }
  .grow:active { background: var(--surface2); }
  .grow .badge { width: 18px; height: 18px; border-radius: 5px; flex: 0 0 auto;
    display: grid; place-items: center; font-size: 10.5px; font-weight: 700; }
  .badge.M { background: rgba(255,176,46,0.15); color: var(--orange); }
  .badge.A { background: rgba(61,220,132,0.15); color: var(--green); }
  .badge.D { background: rgba(255,107,107,0.15); color: var(--red); }
  .badge.U { background: rgba(122,162,255,0.15); color: var(--blue); }
  .grow .p { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; direction: rtl; text-align: left; }
  .grow .p bdi { unicode-bidi: plaintext; }
  .grow .act { width: 26px; height: 26px; border-radius: 7px; flex: 0 0 auto;
    display: grid; place-items: center; color: var(--muted);
    border: 1px solid var(--border); font-size: 15px; line-height: 1; }
  .grow .act:active { background: var(--border2); color: var(--fg); }
  .diffbox { margin: 0 16px 12px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 13px; overflow: hidden; }
  .diffbox .dh { display: flex; align-items: center; gap: 8px; padding: 9px 13px;
    border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--muted); }
  .diffbox .dh .p { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: var(--fg); }
  .diffbox .dbody { overflow-x: auto; max-height: 45vh; overflow-y: auto;
    -webkit-overflow-scrolling: touch; }
  .diffbox pre { margin: 0; padding: 8px 0; font: 11.5px ui-monospace, Menlo, Monaco, monospace; }
  .dl { padding: 0 12px; white-space: pre; }
  .dl-add { background: rgba(61,220,132,0.09); color: #9fe8c0; }
  .dl-del { background: rgba(255,107,107,0.10); color: #f0a4a4; }
  .dl-hunk { color: var(--blue); padding-top: 4px; padding-bottom: 4px; }
  .dl-meta { color: var(--subtle); }
  .commitbox { padding: 4px 16px; padding-bottom: calc(10px + env(safe-area-inset-bottom));
    display: flex; flex-direction: column; gap: 9px; background: var(--bg);
    border-top: 1px solid var(--border); }
  .commitbox input { width: 100%; box-sizing: border-box; padding: 11px 13px; font-size: 14px;
    background: var(--surface); color: var(--fg); border: 1px solid var(--border);
    border-radius: 10px; outline: none; }
  .commitbox input:focus { border-color: var(--accent); }
  .btn-primary { display: flex; align-items: center; justify-content: center; gap: 7px;
    padding: 12px; border-radius: 11px; background: var(--accent); color: var(--accent-fg);
    font-size: 15px; font-weight: 700; }
  .btn-primary:disabled { opacity: 0.4; }
  .btn-primary svg { width: 15px; height: 15px; }

  /* ── Settings ── */
  .srow { display: flex; align-items: center; gap: 10px; padding: 13px 14px;
    border-bottom: 1px solid var(--border); font-size: 14px; }
  .srow:last-child { border-bottom: 0; }
  .srow .k { color: var(--muted); }
  .srow .v { margin-left: auto; color: var(--fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55vw; }
  .danger { color: var(--red); width: 100%; text-align: center; padding: 13px; font-weight: 600;
    background: var(--surface); border: 1px solid var(--border); border-radius: 13px; }
  .footer-note { text-align: center; color: var(--subtle); font-size: 12px; padding: 16px; }

  /* ── Tab bar ── */
  nav { display: flex; background: var(--surface); border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom); flex: 0 0 auto; }
  nav button { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 8px 0 6px; color: var(--subtle); font-size: 10.5px; font-weight: 600; }
  nav button svg { width: 20px; height: 20px; }
  nav button.on { color: var(--accent); }
  nav button.on .navico { background: rgba(255,214,10,0.12); }
  nav .navico { width: 38px; height: 26px; border-radius: 8px; display: grid; place-items: center; }

  /* ── Toast ── */
  #toast { position: fixed; left: 50%; transform: translateX(-50%);
    bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 50;
    background: var(--surface2); border: 1px solid var(--border2); color: var(--fg);
    padding: 10px 16px; border-radius: 11px; font-size: 13px; max-width: 86vw;
    opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  #toast.show { opacity: 1; }
</style>
</head>
<body>
<main>

  <!-- Projects -->
  <section id="scr-projects" class="screen on">
    <div class="ph">
      <div class="logo">D_</div>
      <div class="ph-title">Projects</div>
      <button class="iconbtn" id="projRefresh" aria-label="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
    </div>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="projSearch" placeholder="Search projects..." autocomplete="off">
    </div>
    <div class="scroll"><div class="cards" id="projList"></div></div>
  </section>

  <!-- Workspace -->
  <section id="scr-workspace" class="screen">
    <div class="ph">
      <button class="backbtn" id="wsBack" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="ph-title" id="wsTitle">Workspace</div>
      <div class="chip" id="wsBranchChip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg><span id="wsBranch">—</span></div>
    </div>
    <div class="seg" id="wsSeg">
      <button data-pane="term" class="on">Terminal</button>
      <button data-pane="files">Files</button>
    </div>
    <div id="pane-term" class="pane">
      <div id="term"></div>
      <div class="ws-empty hidden" id="wsEmpty"><div>No active session for this project.<br>Start a tab in the desktop app, then refresh.</div></div>
      <div class="softrow" id="softrow">
        <button data-send="\\u001b">Esc</button>
        <button data-send="\\t">Tab</button>
        <button data-send="\\u0003">Ctrl-C</button>
        <button data-send="\\u0004">Ctrl-D</button>
        <button data-send="\\u001b[A">&#8593;</button>
        <button data-send="\\u001b[B">&#8595;</button>
        <button data-send="\\u001b[D">&#8592;</button>
        <button data-send="\\u001b[C">&#8594;</button>
        <button data-send="\\r">&#8629;</button>
      </div>
    </div>
    <div id="pane-files" class="pane hidden">
      <div class="crumbs" id="crumbs"></div>
      <div class="scroll" id="fileScroll"><div class="filelist" id="fileList"></div></div>
      <div class="fileview hidden" id="fileView"><pre id="fileContent"></pre></div>
    </div>
  </section>

  <!-- Git -->
  <section id="scr-git" class="screen">
    <div class="ph">
      <div class="ph-title" id="gitTitle">Git</div>
      <button class="iconbtn" id="gitRefresh" aria-label="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
    </div>
    <div class="gitbar">
      <div class="gitbranch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        <span class="b" id="gitBranch">—</span>
        <span class="ab" id="gitAB"></span>
      </div>
    </div>
    <div class="scroll" id="gitScroll">
      <div class="gsec">
        <div class="gsec-h">Staged Changes <span class="cnt" id="stagedCnt">0</span></div>
        <div id="stagedList"></div>
      </div>
      <div class="gsec">
        <div class="gsec-h">Unstaged Changes <span class="cnt" id="unstagedCnt">0</span></div>
        <div id="unstagedList"></div>
      </div>
      <div class="diffbox hidden" id="diffBox">
        <div class="dh">
          <span class="p" id="diffPath"></span>
          <button class="act" id="diffClose" style="border:1px solid var(--border);border-radius:7px;width:24px;height:24px;color:var(--muted)">&#10005;</button>
        </div>
        <div class="dbody"><pre id="diffPre"></pre></div>
      </div>
    </div>
    <div class="commitbox">
      <input id="commitMsg" placeholder="Commit message" autocomplete="off">
      <button class="btn-primary" id="commitBtn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Commit
      </button>
    </div>
  </section>

  <!-- Settings -->
  <section id="scr-settings" class="screen">
    <div class="ph"><div class="ph-title">Settings</div></div>
    <div class="scroll">
      <div class="cards">
        <div class="gsec" style="margin:0">
          <div class="srow"><span class="k">Server</span><span class="v" id="setHost"></span></div>
          <div class="srow"><span class="k">Connection</span><span class="v" id="setConn">—</span></div>
          <div class="srow"><span class="k">Session</span><span class="v" id="setSess">—</span></div>
        </div>
        <a href="/logout" style="text-decoration:none"><button class="danger">Log out</button></a>
        <div class="footer-note">Dash &middot; web &mdash; the developer toolkit in your pocket.</div>
      </div>
    </div>
  </section>

</main>

<nav id="tabbar">
  <button data-screen="projects" class="on"><span class="navico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>Projects</button>
  <button data-screen="workspace"><span class="navico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="6 9 9 12 6 15"/><line x1="12" y1="16" x2="17" y2="16"/></svg></span>Workspace</button>
  <button data-screen="git"><span class="navico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg></span>Git</button>
  <button data-screen="settings"><span class="navico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>Settings</button>
</nav>

<div id="toast"></div>

<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
<script>
(async () => {
  'use strict';

  // ── tiny helpers ─────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function svgIcon(paths) {
    const w = document.createElement('span');
    w.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    return w.firstChild;
  }
  const I = {
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    branch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  };
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts || {}));
    if (r.status === 401 || r.redirected) { location.href = '/login'; throw new Error('unauthorized'); }
    return r.json();
  }
  function post(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  // ── state ────────────────────────────────────────────────────────────
  const state = {
    screen: 'projects',
    projects: [],
    filter: '',
    // current target: { projectId, worktreeId, name, branch, sessionKey }
    current: null,
    attachedKey: null,
    filePath: '',         // relative dir in Files pane
    gitStatus: null,
    diffSel: null,        // { path, stage }
  };

  // ── navigation ───────────────────────────────────────────────────────
  const screens = { projects: 'scr-projects', workspace: 'scr-workspace', git: 'scr-git', settings: 'scr-settings' };
  function show(name) {
    state.screen = name;
    for (const k in screens) {
      document.getElementById(screens[k]).classList.toggle('on', k === name);
    }
    for (const b of document.querySelectorAll('nav button')) {
      b.classList.toggle('on', b.getAttribute('data-screen') === name);
    }
    if (name === 'projects') loadProjects();
    if (name === 'workspace') enterWorkspace();
    if (name === 'git') loadGit();
  }
  for (const b of document.querySelectorAll('nav button')) {
    b.addEventListener('click', () => show(b.getAttribute('data-screen')));
  }
  $('wsBack').addEventListener('click', () => show('projects'));

  // ── projects ─────────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const r = await api('/api/projects');
      state.projects = r.projects || [];
      renderProjects();
    } catch (e) { /* ignore */ }
  }
  $('projRefresh').addEventListener('click', loadProjects);
  $('projSearch').addEventListener('input', (e) => {
    state.filter = e.target.value.toLowerCase();
    renderProjects();
  });

  function selectTarget(p, wt) {
    state.current = {
      projectId: p.id,
      worktreeId: wt ? wt.id : null,
      name: wt ? p.name + ' \\u00b7 ' + wt.branch : p.name,
      branch: wt ? wt.branch : (p.branch || ''),
      sessionKey: (wt ? wt.sessionKeys : p.sessionKeys)[0] || null,
    };
    state.filePath = '';
    state.diffSel = null;
    show('workspace');
  }

  // Fuzzy match like the desktop: space-separated terms, order-independent,
  // each a subsequence of the text. (No ranking — filter only.)
  function fuzzyMatch(q, text) {
    if (!q) return true;
    const t = text.toLowerCase();
    const terms = q.split(' ');
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      if (!term) continue;
      let ti = 0;
      for (let c = 0; c < term.length; c++) {
        ti = t.indexOf(term.charAt(c), ti);
        if (ti < 0) return false;
        ti++;
      }
    }
    return true;
  }

  function renderProjects() {
    const list = $('projList');
    list.textContent = '';
    const items = state.projects.filter((p) => fuzzyMatch(state.filter, p.name));
    if (items.length === 0) {
      list.appendChild(el('div', 'empty', state.projects.length === 0
        ? 'No projects yet. Add one in the desktop app.'
        : 'No projects match your search.'));
      return;
    }
    for (const p of items) {
      const card = el('div', 'card');
      const top = el('div', 'card-top');
      const fi = el('div', 'ficon');
      fi.appendChild(svgIcon(I.folder));
      top.appendChild(fi);
      top.appendChild(el('div', 'card-name', p.name));
      const anyActive = p.active || p.worktrees.some((w) => w.active);
      const st = el('div', 'status');
      const dot = el('span', 'dot' + (anyActive ? ' on' : ''));
      st.appendChild(dot);
      st.appendChild(document.createTextNode(anyActive ? 'Active' : 'Idle'));
      top.appendChild(st);
      card.appendChild(top);
      card.appendChild(el('div', 'card-sub', p.path));
      const bottom = el('div', 'card-bottom');
      bottom.appendChild(el('span', '', p.lastOpenedAt ? 'Updated ' + timeAgo(p.lastOpenedAt) : 'Never opened'));
      if (p.branch) {
        const br = el('span', 'branch');
        br.appendChild(svgIcon(I.branch));
        br.appendChild(document.createTextNode(p.branch));
        bottom.appendChild(br);
      }
      card.appendChild(bottom);
      card.addEventListener('click', () => selectTarget(p, null));
      for (const wt of p.worktrees) {
        const row = el('button', 'wtrow');
        row.appendChild(svgIcon(I.branch));
        row.appendChild(el('span', 'b', wt.branch));
        const wdot = el('span', 'dot' + (wt.active ? ' on' : ''));
        row.appendChild(wdot);
        row.addEventListener('click', (e) => { e.stopPropagation(); selectTarget(p, wt); });
        card.appendChild(row);
      }
      list.appendChild(card);
    }
  }

  // ── workspace: terminal ──────────────────────────────────────────────
  let styleOpts = {
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    theme: { background: '#000000' },
  };
  try {
    const s = await api('/api/style');
    if (s && typeof s === 'object') styleOpts = Object.assign(styleOpts, s);
  } catch (e) { /* ignore */ }

  const term = new window.Terminal({
    fontFamily: styleOpts.fontFamily,
    fontSize: styleOpts.fontSize,
    cursorStyle: styleOpts.cursorStyle,
    cursorBlink: styleOpts.cursorBlink !== false,
    scrollback: styleOpts.scrollback != null ? styleOpts.scrollback : 1000,
    theme: styleOpts.theme,
    convertEol: false,
  });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($('term'));
  if (styleOpts.theme && styleOpts.theme.background) {
    $('term').style.background = styleOpts.theme.background;
  }

  let ws = null;
  let resizeTimer = null;
  function doFit() {
    if (state.screen !== 'workspace' || wsPane !== 'term') return;
    try { fit.fit(); } catch (e) { /* ignore */ }
    if (ws && ws.readyState === 1 && state.attachedKey) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  }
  function scheduleFit() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(doFit, 80);
  }
  function applyViewportHeight() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', h + 'px');
  }
  applyViewportHeight();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => { applyViewportHeight(); scheduleFit(); });
    window.visualViewport.addEventListener('scroll', applyViewportHeight);
  }
  window.addEventListener('resize', () => { applyViewportHeight(); scheduleFit(); });

  function b64encode(s) { return btoa(s); }
  function b64decodeToBytes(b) {
    const bin = atob(b);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = () => {
      $('setConn').textContent = 'Connected';
      // Re-attach after a reconnect.
      if (state.current && state.current.sessionKey) attachTo(state.current.sessionKey);
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'attached') {
        state.attachedKey = msg.key;
        term.reset();
        scheduleFit();
      } else if (msg.type === 'data') {
        term.write(b64decodeToBytes(msg.data));
      } else if (msg.type === 'error') {
        toast(msg.message || 'session error');
      }
    };
    ws.onclose = () => {
      state.attachedKey = null;
      $('setConn').textContent = 'Reconnecting\\u2026';
      setTimeout(connect, 1500);
    };
  }

  function attachTo(key) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'attach', key: key, cols: term.cols, rows: term.rows }));
  }

  term.onData((d) => {
    if (ws && ws.readyState === 1 && state.attachedKey) {
      ws.send(JSON.stringify({ type: 'input', data: b64encode(d) }));
    }
  });
  $('term').addEventListener('click', () => term.focus());
  for (const btn of document.querySelectorAll('.softrow button')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const raw = btn.getAttribute('data-send') || '';
      const s = JSON.parse('"' + raw.replace(/"/g, '\\\\"') + '"');
      if (ws && ws.readyState === 1 && state.attachedKey) {
        ws.send(JSON.stringify({ type: 'input', data: b64encode(s) }));
      }
      term.focus();
    });
  }

  // ── workspace: panes ─────────────────────────────────────────────────
  let wsPane = 'term';
  function setPane(name) {
    wsPane = name;
    for (const b of document.querySelectorAll('#wsSeg button')) {
      b.classList.toggle('on', b.getAttribute('data-pane') === name);
    }
    $('pane-term').classList.toggle('hidden', name !== 'term');
    $('pane-files').classList.toggle('hidden', name !== 'files');
    if (name === 'term') scheduleFit();
    if (name === 'files') loadFiles();
  }
  for (const b of document.querySelectorAll('#wsSeg button')) {
    b.addEventListener('click', () => setPane(b.getAttribute('data-pane')));
  }

  function enterWorkspace() {
    const c = state.current;
    $('wsTitle').textContent = c ? c.name : 'Workspace';
    $('wsBranch').textContent = c && c.branch ? c.branch : '\\u2014';
    const hasSession = !!(c && c.sessionKey);
    $('term').classList.toggle('hidden', !hasSession);
    $('wsEmpty').classList.toggle('hidden', hasSession);
    if (hasSession && state.attachedKey !== c.sessionKey) {
      attachTo(c.sessionKey);
    }
    setPane(wsPane);
  }

  // ── workspace: files ─────────────────────────────────────────────────
  function targetQS() {
    const c = state.current;
    if (!c) return null;
    let qs = 'projectId=' + encodeURIComponent(c.projectId);
    if (c.worktreeId) qs += '&worktreeId=' + encodeURIComponent(c.worktreeId);
    return qs;
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  async function loadFiles() {
    const qs = targetQS();
    const list = $('fileList');
    $('fileView').classList.add('hidden');
    $('fileScroll').classList.remove('hidden');
    list.textContent = '';
    renderCrumbs();
    if (!qs) {
      list.appendChild(el('div', 'empty', 'Select a project first.'));
      return;
    }
    try {
      const r = await api('/api/files?' + qs + '&path=' + encodeURIComponent(state.filePath));
      if (!r.ok) { list.appendChild(el('div', 'empty', r.error || 'Failed to list files.')); return; }
      if (r.entries.length === 0) { list.appendChild(el('div', 'empty', 'Empty directory.')); return; }
      for (const ent of r.entries) {
        const row = el('button', 'frow' + (ent.dir ? ' dir' : ''));
        row.appendChild(svgIcon(ent.dir ? I.folder : I.file));
        row.appendChild(el('span', 'n', ent.name));
        if (!ent.dir) row.appendChild(el('span', 'sz', fmtSize(ent.size)));
        row.addEventListener('click', () => {
          const next = state.filePath ? state.filePath + '/' + ent.name : ent.name;
          if (ent.dir) { state.filePath = next; loadFiles(); }
          else openFile(next);
        });
        list.appendChild(row);
      }
    } catch (e) { list.appendChild(el('div', 'empty', 'Failed to list files.')); }
  }
  function renderCrumbs() {
    const c = $('crumbs');
    c.textContent = '';
    const root = el('button', '', state.current ? state.current.name : 'root');
    root.addEventListener('click', () => { state.filePath = ''; loadFiles(); });
    c.appendChild(root);
    if (!state.filePath) return;
    const parts = state.filePath.split('/');
    let acc = '';
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part;
      c.appendChild(el('span', 'sep', ' / '));
      const b = el('button', '', part);
      const target = acc;
      b.addEventListener('click', () => { state.filePath = target; loadFiles(); });
      c.appendChild(b);
    }
  }
  async function openFile(rel) {
    const qs = targetQS();
    if (!qs) return;
    try {
      const r = await api('/api/file?' + qs + '&path=' + encodeURIComponent(rel));
      if (!r.ok) { toast(r.error || 'Failed to open file.'); return; }
      $('fileScroll').classList.add('hidden');
      $('fileView').classList.remove('hidden');
      const crumbs = $('crumbs');
      crumbs.textContent = '';
      const back = el('button', '', '\\u2039 Back');
      back.addEventListener('click', loadFiles);
      crumbs.appendChild(back);
      crumbs.appendChild(el('span', 'sep', ' / '));
      crumbs.appendChild(el('span', '', rel));
      $('fileContent').textContent = r.binary
        ? '[binary file]'
        : r.content + (r.truncated ? '\\n\\n[truncated]' : '');
    } catch (e) { toast('Failed to open file.'); }
  }

  // ── git ──────────────────────────────────────────────────────────────
  const CHANGE_BADGE = {
    added: 'A', modified: 'M', deleted: 'D', renamed: 'M', copied: 'A',
    typechange: 'M', untracked: 'U', ignored: 'U', conflicted: 'M',
  };
  async function loadGit() {
    const c = state.current;
    $('gitTitle').textContent = c ? 'Git \\u00b7 ' + c.name : 'Git';
    if (!c) {
      $('gitBranch').textContent = '\\u2014';
      $('gitAB').textContent = '';
      renderGitLists(null);
      return;
    }
    try {
      const r = await api('/api/git/status?' + targetQS());
      if (!r.ok) {
        $('gitBranch').textContent = '\\u2014';
        $('gitAB').textContent = '';
        renderGitLists(null);
        toast(r.error || 'Not a git repository.');
        return;
      }
      state.gitStatus = r.status;
      $('gitBranch').textContent = r.status.branch || (r.status.detached ? 'detached' : '\\u2014');
      const ab = $('gitAB');
      ab.textContent = '';
      if (r.status.ahead) {
        const up = el('span', 'up', '\\u2191' + r.status.ahead);
        ab.appendChild(up);
      }
      if (r.status.behind) {
        const down = el('span', 'down', '\\u2193' + r.status.behind);
        ab.appendChild(down);
      }
      renderGitLists(r.status);
    } catch (e) { /* ignore */ }
  }
  $('gitRefresh').addEventListener('click', loadGit);

  function gitRow(f, staged) {
    const row = el('button', 'grow');
    const badge = el('span', 'badge ' + (CHANGE_BADGE[f.change] || 'M'), CHANGE_BADGE[f.change] || 'M');
    row.appendChild(badge);
    const p = el('span', 'p');
    const bdi = document.createElement('bdi');
    bdi.textContent = f.path;
    p.appendChild(bdi);
    row.appendChild(p);
    const act = el('span', 'act', staged ? '\\u2212' : '+');
    act.addEventListener('click', async (e) => {
      e.stopPropagation();
      const body = Object.assign({ paths: [f.path] }, targetBody());
      try {
        const r = await post(staged ? '/api/git/unstage' : '/api/git/stage', body);
        if (!r.ok) toast(r.error || 'git failed');
        loadGit();
      } catch (err) { toast('git failed'); }
    });
    row.appendChild(act);
    row.addEventListener('click', () => showDiff(f));
    return row;
  }
  function targetBody() {
    const c = state.current;
    return { projectId: c.projectId, worktreeId: c.worktreeId };
  }
  function renderGitLists(status) {
    const sl = $('stagedList'); const ul = $('unstagedList');
    sl.textContent = ''; ul.textContent = '';
    $('diffBox').classList.add('hidden');
    const files = status ? status.files : [];
    const staged = files.filter((f) => f.stage === 'staged');
    const unstaged = files.filter((f) => f.stage !== 'staged');
    $('stagedCnt').textContent = String(staged.length);
    $('unstagedCnt').textContent = String(unstaged.length);
    if (staged.length === 0) sl.appendChild(el('div', 'empty', status ? 'Nothing staged.' : 'Select a project first.'));
    for (const f of staged) sl.appendChild(gitRow(f, true));
    if (unstaged.length === 0) ul.appendChild(el('div', 'empty', status ? 'Working tree clean.' : 'Select a project first.'));
    for (const f of unstaged) ul.appendChild(gitRow(f, false));
    updateCommitBtn();
  }
  async function showDiff(f) {
    const qs = targetQS();
    if (!qs) return;
    try {
      const r = await api('/api/git/diff?' + qs +
        '&path=' + encodeURIComponent(f.path) +
        '&stage=' + encodeURIComponent(f.stage));
      if (!r.ok) { toast(r.error || 'diff failed'); return; }
      $('diffPath').textContent = f.path;
      const pre = $('diffPre');
      pre.textContent = '';
      if (r.binary) {
        pre.appendChild(el('div', 'dl dl-meta', '[binary file]'));
      } else {
        for (const line of r.diff.split('\\n')) {
          let cls = 'dl';
          if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) cls += ' dl-meta';
          else if (line.startsWith('@@')) cls += ' dl-hunk';
          else if (line.startsWith('+')) cls += ' dl-add';
          else if (line.startsWith('-')) cls += ' dl-del';
          pre.appendChild(el('div', cls, line.length ? line : ' '));
        }
      }
      $('diffBox').classList.remove('hidden');
      $('diffBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { toast('diff failed'); }
  }
  $('diffClose').addEventListener('click', () => $('diffBox').classList.add('hidden'));

  function updateCommitBtn() {
    const stagedCount = state.gitStatus
      ? state.gitStatus.files.filter((f) => f.stage === 'staged').length : 0;
    $('commitBtn').disabled = !(stagedCount > 0 && $('commitMsg').value.trim().length > 0);
  }
  $('commitMsg').addEventListener('input', updateCommitBtn);
  $('commitBtn').addEventListener('click', async () => {
    const subject = $('commitMsg').value.trim();
    if (!subject || !state.current) return;
    $('commitBtn').disabled = true;
    try {
      const r = await post('/api/git/commit', Object.assign({ subject: subject }, targetBody()));
      if (r.ok) {
        $('commitMsg').value = '';
        toast('Committed.');
      } else {
        toast(r.error || 'commit failed');
      }
    } catch (e) { toast('commit failed'); }
    loadGit();
  });

  // ── settings ─────────────────────────────────────────────────────────
  $('setHost').textContent = location.host;
  $('setSess').textContent = 'Signed in';

  // ── boot ─────────────────────────────────────────────────────────────
  connect();
  loadProjects();
})();
</script>
</body>
</html>`;
