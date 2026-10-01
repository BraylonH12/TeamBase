(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * DOM helpers
   * ------------------------------------------------------------------ */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function append(node, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
  }

  /** h('div', { class: 'x', text: 'hi', onclick: fn }, ...children) */
  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    append(node, kids);
    return node;
  }

  function button(label, onClick, variant = '', extra = {}) {
    const classes = ['btn', variant && `btn-${variant}`].filter(Boolean).join(' ');
    return h('button', { type: 'button', class: classes, onclick: onClick, ...extra }, label);
  }

  /** A group of toggle buttons. Updates its own pressed state in place. */
  function segmented(label, options, value, onChange) {
    const group = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
    const buttons = options.map(([val, text]) => h('button', {
      type: 'button',
      'aria-pressed': String(val === value),
      onclick: () => {
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === val)));
        onChange(val);
      },
    }, text));
    group.append(...buttons);
    return group;
  }

  /* ------------------------------------------------------------------ *
   * Dates and times
   *
   * The API sends dates as 'YYYY-MM-DD' and times as 'HH:MM:SS'. Dates are
   * parsed as local calendar dates so an event never slips a day.
   * ------------------------------------------------------------------ */

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOnly = (value) => String(value).slice(0, 10);

  function parseYmd(value) {
    const [y, m, d] = dateOnly(value).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function startsAt(event) {
    const [hh, mm] = String(event.event_time).split(':').map(Number);
    const d = parseYmd(event.event_date);
    d.setHours(hh, mm || 0, 0, 0);
    return d;
  }

  function fmtTime(time) {
    const [hh, mm] = String(time).split(':').map(Number);
    return new Date(2000, 0, 1, hh, mm || 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDayLong = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  function countdown(start) {
    const now = new Date();
    const days = dayDiff(start, now);
    if (days === 0) {
      const mins = Math.round((start - now) / 60000);
      if (mins <= 0) return { big: 'Today', small: 'under way' };
      if (mins < 60) return { big: 'Today', small: `in ${mins} min` };
      return { big: 'Today', small: `in ${Math.floor(mins / 60)} hr` };
    }
    if (days === 1) return { big: 'Tomorrow', small: fmtTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`) };
    return { big: `${days} days`, small: 'away' };
  }

  function fmtRelative(iso) {
    const then = new Date(iso);
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 60 * 24 && dayDiff(new Date(), then) === 0) return `${Math.floor(mins / 60)} hr ago`;
    if (dayDiff(new Date(), then) === 1) return 'Yesterday';
    return then.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const ROLE_LABEL = { Owner: 'Athletic director', Player: 'Player' };
  const STATUS_LABEL = { Pending: 'Pending', Accepted: 'Accepted', Rejected: 'Declined' };
  const SAVED_TEAM_KEY = 'teambase.activeTeam';

  const state = {
    user: null,
    teams: [],        // teams the user owns (Owner) or plays for (Player)
    allTeams: [],     // every team, for choosing opponents (Owner)
    teamId: null,
    roster: [],
    events: [],
    posts: [],
    requests: [],     // game requests involving the owner's teams
    view: 'overview',
    schedule: { range: 'upcoming', type: 'all', mode: 'list', month: firstOfMonth(new Date()), selectedDay: ymd(new Date()) },
    rosterUi: { query: '', sort: 'jersey', dir: 1 },
  };

  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  const isOwner = () => state.user && state.user.role === 'Owner';
  const activeTeam = () => state.teams.find((t) => t.id === state.teamId) || null;
  const myTeamIds = () => new Set(state.teams.map((t) => t.id));
  const incomingRequests = () => state.requests.filter((r) => myTeamIds().has(r.receiver_team_id));
  const pendingIncoming = () => incomingRequests().filter((r) => r.status === 'Pending');

  function upcomingEvents() {
    const now = new Date();
    return state.events.filter((e) => startsAt(e) >= now).sort((a, b) => startsAt(a) - startsAt(b));
  }

  /* ------------------------------------------------------------------ *
   * API
   * ------------------------------------------------------------------ */

  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function api(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('Unable to reach the server. Check your connection and try again.', 0);
    }

    let data = {};
    try { data = await response.json(); } catch { /* empty body */ }

    if (response.status === 401) {
      window.location.assign('/login.html');
      throw new ApiError('Your session has ended. Log in again.', 401);
    }
    if (!response.ok) throw new ApiError(data.message || 'Something went wrong. Try again.', response.status);
    return data;
  }

  /* ------------------------------------------------------------------ *
   * Data loading
   * ------------------------------------------------------------------ */

  async function loadTeamData() {
    const id = state.teamId;
    if (!id) {
      state.roster = []; state.events = []; state.posts = [];
      return;
    }
    const [roster, events, posts] = await Promise.all([
      api(`/teams/${id}/roster`),
      api(`/teams/${id}/events`),
      api(`/teams/${id}/posts`),
    ]);
    if (id !== state.teamId) return; // user switched teams while this was loading
    state.roster = roster.players;
    state.events = events.events;
    state.posts = posts.posts;
  }

  async function loadAll(preferTeamId) {
    const [mine, owner] = await Promise.all([
      api('/teams/mine'),
      isOwner() ? Promise.all([api('/teams'), api('/game-requests')]) : null,
    ]);
    state.teams = mine.teams;
    if (owner) {
      state.allTeams = owner[0].teams;
      state.requests = owner[1].game_requests;
    }
    const saved = Number(readSavedTeam());
    state.teamId = [preferTeamId, saved].find((id) => mine.teams.some((t) => t.id === id))
      ?? (mine.teams[0] ? mine.teams[0].id : null);
    if (state.teamId) saveTeam(state.teamId);
    await loadTeamData();
  }

  async function refreshRequests() {
    if (!isOwner()) return;
    state.requests = (await api('/game-requests')).game_requests;
  }

  function readSavedTeam() { try { return localStorage.getItem(SAVED_TEAM_KEY); } catch { return null; } }
  function saveTeam(id) { try { localStorage.setItem(SAVED_TEAM_KEY, String(id)); } catch { /* storage unavailable */ } }

  /* ------------------------------------------------------------------ *
   * Feedback: toasts and error banner
   * ------------------------------------------------------------------ */

  function toast(message, kind = 'success') {
    const node = h('div', { class: `toast${kind === 'error' ? ' is-error' : ''}`, text: message });
    const host = $('#toasts');
    host.append(node);
    while (host.children.length > 3) host.firstElementChild.remove(); // keep the stack short
    setTimeout(() => node.remove(), 4500);
  }

  function showBanner(message, onRetry) {
    const banner = $('#banner');
    banner.replaceChildren(h('span', { text: message }));
    if (onRetry) banner.append(button('Try again', onRetry, 'secondary', { class: 'btn btn-secondary btn-sm' }));
    banner.hidden = false;
  }
  const clearBanner = () => { $('#banner').hidden = true; };

  /* ------------------------------------------------------------------ *
   * Shared view pieces
   * ------------------------------------------------------------------ */

  function eventRow(event, { showDate = true } = {}) {
    const start = startsAt(event);
    const isGame = event.event_type === 'Game';
    const past = start < new Date();
    const showOpponent = event.opponent_name && !event.title.includes(event.opponent_name);

    return h('li', { class: `event ${isGame ? 'is-game' : 'is-practice'}${past ? ' is-past' : ''}` },
      h('div', { class: 'event-date', 'aria-hidden': 'true' },
        h('span', { class: 'day', text: start.getDate() }),
        h('span', { class: 'mon', text: start.toLocaleDateString([], { month: 'short' }) })),
      h('div', {},
        h('h3', { text: event.title }),
        h('p', { class: 'event-meta' },
          h('span', { text: `${showDate ? `${fmtDay(start)}, ` : ''}${fmtTime(event.event_time)}` }),
          h('span', { text: event.location }),
          showOpponent ? h('span', { text: `vs ${event.opponent_name}` }) : null)),
      h('span', { class: `tag ${isGame ? 'tag-game' : 'tag-practice'}`, text: event.event_type }));
  }

  function requestRow(request) {
    const mine = myTeamIds();
    const incoming = mine.has(request.receiver_team_id);
    const start = startsAt({ event_date: request.proposed_date, event_time: request.proposed_time });
    const title = incoming
      ? `${request.sender_team_name} wants to play ${request.receiver_team_name}`
      : `${request.sender_team_name} asked ${request.receiver_team_name}`;

    let side;
    if (incoming && request.status === 'Pending') {
      const accept = button('Accept', () => respondToRequest(request.id, 'Accepted', accept, decline), '', { class: 'btn btn-sm' });
      const decline = button('Decline', () => respondToRequest(request.id, 'Rejected', accept, decline), 'secondary', { class: 'btn btn-secondary btn-sm' });
      side = h('div', { class: 'request-actions' }, accept, decline);
    } else {
      side = h('span', { class: `tag tag-${STATUS_LABEL[request.status].toLowerCase()}`, text: STATUS_LABEL[request.status] });
    }

    return h('li', { class: 'request' },
      h('div', {},
        h('h3', { text: title }),
        h('p', { class: 'event-meta' },
          h('span', { text: `${fmtDay(start)}, ${fmtTime(request.proposed_time)}` }),
          h('span', { text: request.location }))),
      side);
  }

  function emptyNote(text) { return h('p', { class: 'empty-note', text }); }

  function noTeamPanel() {
    if (isOwner()) {
      return h('div', { class: 'welcome' },
        h('h2', { text: 'Create your first team' }),
        h('p', { text: 'Teams hold your roster, practice and game schedule, and announcements. Once you have one, you can also send game requests to other teams.' }),
        button('Create a team', openTeamDialog));
    }
    return h('div', { class: 'welcome' },
      h('h2', { text: "You're not on a roster yet" }),
      h('p', { text: `Ask your athletic director to add you to their team using the email you signed up with (${state.user.email}). Your schedule and announcements will appear here as soon as they do.` }));
  }

  /* ------------------------------------------------------------------ *
   * View: Overview
   * ------------------------------------------------------------------ */

  function renderOverview(root) {
    const upcoming = upcomingEvents();
    root.append(nextUpBoard(upcoming[0]));

    const games = upcoming.filter((e) => e.event_type === 'Game').length;
    const stats = [
      [state.roster.length, state.roster.length === 1 ? 'Player' : 'Players'],
      [upcoming.length, 'Upcoming events'],
      [games, games === 1 ? 'Game ahead' : 'Games ahead'],
    ];
    if (isOwner()) stats.push([pendingIncoming().length, 'Requests awaiting reply', pendingIncoming().length > 0]);
    root.append(h('div', { class: 'stats' }, stats.map(([n, label, attention]) =>
      h('div', { class: `stat${attention ? ' is-attention' : ''}` }, h('strong', { text: n }), h('span', { text: label })))));

    const later = upcoming.slice(1, 6);
    const comingUp = h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', { text: 'Coming up' }),
        h('a', { href: '#schedule', text: 'Full schedule' })),
      later.length
        ? h('ul', { class: 'event-list' }, later.map((e) => eventRow(e)))
        : emptyNote(upcoming.length ? 'Nothing else scheduled after this.' : 'No upcoming events.'));

    const side = h('div', { class: 'stack' });
    const pending = pendingIncoming();
    if (isOwner() && pending.length) {
      side.append(h('section', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('h2', { text: 'Waiting on your reply' }),
          h('a', { href: '#requests', text: 'All requests' })),
        h('ul', {}, pending.slice(0, 3).map(requestRow))));
    }

    const latest = state.posts.slice(0, 2);
    side.append(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', { text: 'Announcements' }),
        h('a', { href: '#announcements', text: 'See all' })),
      latest.length
        ? latest.map((p) => h('article', { class: 'mini-post' },
          h('h3', { text: p.title }),
          h('p', { class: 'post-meta', text: `${p.author_name}, ${fmtRelative(p.created_at)}` }),
          h('p', { class: 'post-snippet', text: p.content })))
        : emptyNote('No announcements yet.')));

    root.append(h('div', { class: 'two-col' }, comingUp, side));
  }

  function nextUpBoard(event) {
    if (!event) {
      return h('section', { class: 'nextup nextup-empty' },
        h('div', {},
          h('h2', { text: 'Nothing on the schedule yet' }),
          h('p', { text: isOwner()
            ? 'Add a practice or send a game request and it will show up here.'
            : "Your athletic director hasn't scheduled anything yet. Check back soon." })),
        isOwner()
          ? h('div', { class: 'btn-row' },
            button('Add an event', () => openEventDialog()),
            button('Request a game', () => openRequestDialog(), 'secondary'))
          : null);
    }

    const start = startsAt(event);
    const isGame = event.event_type === 'Game';
    const when = countdown(start);
    const showOpponent = event.opponent_name && !event.title.includes(event.opponent_name);

    return h('section', { class: `nextup ${isGame ? 'is-game' : 'is-practice'}`, 'aria-label': 'Next event' },
      h('div', { class: 'nextup-date', 'aria-hidden': 'true' },
        h('span', { class: 'nextup-day', text: start.getDate() }),
        h('span', { class: 'nextup-mon', text: start.toLocaleDateString([], { month: 'short' }) })),
      h('div', {},
        h('span', { class: 'nextup-kind', text: isGame ? 'Next game' : 'Next practice' }),
        h('h2', { text: event.title }),
        h('p', { class: 'nextup-detail', text: `${start.toLocaleDateString([], { weekday: 'long' })} at ${fmtTime(event.event_time)}, ${event.location}${showOpponent ? `, vs ${event.opponent_name}` : ''}` })),
      h('div', { class: 'nextup-count' }, h('strong', { text: when.big }), h('span', { text: when.small })));
  }

  /* ------------------------------------------------------------------ *
   * View: Schedule (list and month calendar)
   * ------------------------------------------------------------------ */

  function renderSchedule(root) {
    const s = state.schedule;

    const body = h('div', {});
    const draw = () => body.replaceChildren(s.mode === 'month' ? monthView() : listView());

    const rangeControl = segmented('Show', [['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']], s.range, (v) => { s.range = v; draw(); });
    rangeControl.hidden = s.mode === 'month';
    const typeControl = segmented('Event type', [['all', 'All'], ['Game', 'Games'], ['Practice', 'Practices']], s.type, (v) => { s.type = v; draw(); });
    const modeControl = segmented('View', [['list', 'List'], ['month', 'Month']], s.mode, (v) => {
      s.mode = v;
      rangeControl.hidden = v === 'month';
      draw();
    });

    root.append(
      h('div', { class: 'toolbar' },
        modeControl, rangeControl, typeControl,
        h('span', { class: 'spacer' }),
        isOwner() ? button('Add event', () => openEventDialog()) : null),
      body);
    draw();
  }

  function typeFiltered() {
    const { type } = state.schedule;
    return state.events.filter((e) => type === 'all' || e.event_type === type);
  }

  function listView() {
    const { range } = state.schedule;
    const now = new Date();
    let events = typeFiltered();
    if (range === 'upcoming') events = events.filter((e) => startsAt(e) >= now);
    if (range === 'past') events = events.filter((e) => startsAt(e) < now);
    events.sort((a, b) => (range === 'past' ? startsAt(b) - startsAt(a) : startsAt(a) - startsAt(b)));

    if (!events.length) {
      const what = state.schedule.type === 'all' ? 'events' : `${state.schedule.type.toLowerCase()}s`;
      return h('div', { class: 'welcome' },
        h('h2', { text: range === 'past' ? `No past ${what}` : `No ${range === 'upcoming' ? 'upcoming ' : ''}${what}` }),
        h('p', { text: isOwner() ? 'Add one to put it on the team calendar.' : 'Check back after your athletic director schedules something.' }),
        isOwner() ? button('Add event', () => openEventDialog()) : null);
    }

    const groups = new Map();
    for (const event of events) {
      const label = startsAt(event).toLocaleDateString([], { month: 'long', year: 'numeric' });
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(event);
    }
    return h('div', {}, [...groups].map(([label, items]) =>
      h('section', { class: 'event-group' },
        h('h3', { text: label }),
        h('ul', { class: 'event-list is-boxed' }, items.map((e) => eventRow(e))))));
  }

  function monthView() {
    const s = state.schedule;
    const wrap = h('div', {});
    const title = h('h2', { 'aria-live': 'polite' });
    const gridHost = h('div', {});
    const dayHost = h('div', { class: 'day-panel' });

    const shiftMonth = (delta) => {
      s.month = new Date(s.month.getFullYear(), s.month.getMonth() + delta, 1);
      drawGrid();
    };
    const nav = h('div', { class: 'cal-nav' },
      button('Previous', () => shiftMonth(-1), 'secondary', { class: 'btn btn-secondary btn-sm', 'aria-label': 'Previous month' }),
      button('Today', () => { s.month = firstOfMonth(new Date()); s.selectedDay = ymd(new Date()); drawGrid(); }, 'secondary', { class: 'btn btn-secondary btn-sm' }),
      button('Next', () => shiftMonth(1), 'secondary', { class: 'btn btn-secondary btn-sm', 'aria-label': 'Next month' }),
      title);

    const eventsByDay = () => {
      const map = new Map();
      for (const e of typeFiltered()) {
        const key = dateOnly(e.event_date);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(e);
      }
      for (const list of map.values()) list.sort((a, b) => startsAt(a) - startsAt(b));
      return map;
    };

    function drawDayPanel() {
      const day = parseYmd(s.selectedDay);
      const items = eventsByDay().get(s.selectedDay) || [];
      dayHost.replaceChildren(
        h('div', { class: 'day-panel-head' },
          h('h2', { class: 'section-title', text: fmtDayLong(day) }),
          isOwner() ? button('Add event on this day', () => openEventDialog({ date: s.selectedDay }), 'secondary', { class: 'btn btn-secondary btn-sm' }) : null),
        items.length
          ? h('ul', { class: 'event-list is-boxed' }, items.map((e) => eventRow(e, { showDate: false })))
          : emptyNote('Nothing scheduled this day.'));
    }

    function drawGrid() {
      title.textContent = s.month.toLocaleDateString([], { month: 'long', year: 'numeric' });
      const byDay = eventsByDay();
      const first = s.month;
      const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
      const todayKey = ymd(new Date());

      const grid = h('div', { class: 'cal-grid', role: 'group', 'aria-label': title.textContent });
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => grid.append(h('div', { class: 'cal-dow', text: d })));

      for (let i = 0; i < 42; i += 1) {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        if (i >= 35 && date.getMonth() !== first.getMonth()) break; // skip a fully-empty trailing week
        const key = ymd(date);
        const items = byDay.get(key) || [];
        const classes = ['cal-cell'];
        if (date.getMonth() !== first.getMonth()) classes.push('is-other');
        if (key === todayKey) classes.push('is-today');
        if (key === s.selectedDay) classes.push('is-selected');

        const cell = h('button', {
          type: 'button',
          class: classes.join(' '),
          'aria-pressed': String(key === s.selectedDay),
          'aria-label': `${fmtDayLong(date)}, ${items.length === 0 ? 'no events' : `${items.length} event${items.length > 1 ? 's' : ''}`}`,
          dataset: { day: key, hasEvents: String(items.length > 0) },
          onclick: () => {
            s.selectedDay = key;
            $$('.cal-cell', grid).forEach((c) => {
              const on = c.dataset.day === key;
              c.classList.toggle('is-selected', on);
              c.setAttribute('aria-pressed', String(on));
            });
            drawDayPanel();
          },
        },
        h('span', { class: 'cal-num', text: date.getDate() }),
        items.slice(0, 2).map((e) => h('span', { class: `cal-chip ${e.event_type === 'Game' ? 'is-game' : 'is-practice'}`, text: `${fmtTime(e.event_time)} ${e.title}` })),
        items.length > 2 ? h('span', { class: 'cal-more', text: `+${items.length - 2} more` }) : null);
        grid.append(cell);
      }
      gridHost.replaceChildren(grid);
      drawDayPanel();
    }

    wrap.append(nav, gridHost, dayHost);
    drawGrid();
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * View: Roster
   * ------------------------------------------------------------------ */

  function renderRoster(root) {
    const ui = state.rosterUi;
    const showAccount = isOwner();

    const count = h('span', { class: 'result-count' });
    const search = h('input', {
      class: 'search',
      type: 'search',
      placeholder: 'Search players',
      'aria-label': 'Search roster',
      value: ui.query,
      oninput: (e) => { ui.query = e.target.value; drawRows(); },
    });

    const headers = [['jersey', '#'], ['name', 'Player'], ['position', 'Position']];
    const headRow = h('tr', {});
    const headCells = headers.map(([key, label]) => {
      const th = h('th', { scope: 'col' }, h('button', {
        type: 'button',
        onclick: () => {
          if (ui.sort === key) ui.dir *= -1; else { ui.sort = key; ui.dir = 1; }
          drawRows();
        },
      }, label));
      headRow.append(th);
      return [key, th];
    });
    if (showAccount) headRow.append(h('th', { scope: 'col', text: 'Account' }));

    const tbody = h('tbody', {});

    function drawRows() {
      const q = ui.query.trim().toLowerCase();
      let rows = state.roster.filter((p) => !q || p.name.toLowerCase().includes(q) || p.position.toLowerCase().includes(q));
      rows = [...rows].sort((a, b) => {
        const av = ui.sort === 'jersey' ? a.jersey_number : a[ui.sort].toLowerCase();
        const bv = ui.sort === 'jersey' ? b.jersey_number : b[ui.sort].toLowerCase();
        return (av < bv ? -1 : av > bv ? 1 : 0) * ui.dir;
      });
      headCells.forEach(([key, th]) => {
        if (key === ui.sort) th.setAttribute('aria-sort', ui.dir === 1 ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
      count.textContent = `${rows.length} of ${state.roster.length} ${state.roster.length === 1 ? 'player' : 'players'}`;

      tbody.replaceChildren(...rows.map((p) => {
        const isMe = p.user_id != null && String(p.user_id) === String(state.user.id);
        return h('tr', {},
          h('td', { class: 'jersey', text: p.jersey_number }),
          h('td', {}, p.name, isMe ? h('span', { class: 'tag tag-you', text: 'You' }) : null),
          h('td', { text: p.position }),
          showAccount ? h('td', { class: p.user_id ? '' : 'muted', text: p.user_id ? 'Linked' : 'Not linked' }) : null);
      }));
      if (!rows.length) {
        tbody.append(h('tr', {}, h('td', { colspan: showAccount ? 4 : 3, class: 'muted', text: state.roster.length ? 'No players match that search.' : 'No players on the roster yet.' })));
      }
    }

    root.append(
      h('div', { class: 'toolbar' }, search, count, h('span', { class: 'spacer' }),
        isOwner() ? button('Add player', openPlayerDialog) : null),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, headRow), tbody)));
    drawRows();
  }

  /* ------------------------------------------------------------------ *
   * View: Announcements
   * ------------------------------------------------------------------ */

  function renderAnnouncements(root) {
    root.append(h('div', { class: 'toolbar' }, h('span', { class: 'spacer' }),
      isOwner() ? button('Post announcement', openPostDialog) : null));

    if (!state.posts.length) {
      root.append(h('div', { class: 'welcome' },
        h('h2', { text: 'No announcements yet' }),
        h('p', { text: isOwner() ? 'Post a note and everyone on the roster will see it here.' : 'Updates from your athletic director will show up here.' }),
        isOwner() ? button('Post announcement', openPostDialog) : null));
      return;
    }

    root.append(h('div', { class: 'post-list' }, state.posts.map((p) =>
      h('article', { class: 'post' },
        h('h3', { text: p.title }),
        h('p', { class: 'post-meta', title: new Date(p.created_at).toLocaleString(), text: `${p.author_name}, ${fmtRelative(p.created_at)}` }),
        h('p', { class: 'post-body', text: p.content })))));
  }

  /* ------------------------------------------------------------------ *
   * View: Game requests (owners)
   * ------------------------------------------------------------------ */

  function renderRequests(root) {
    root.append(h('div', { class: 'toolbar' }, h('span', { class: 'spacer' }),
      button('Request a game', () => openRequestDialog())));

    const incoming = [...incomingRequests()].sort((a, b) => (b.status === 'Pending') - (a.status === 'Pending'));
    const incomingIds = new Set(incoming.map((r) => r.id));
    const mine = myTeamIds();
    const sent = state.requests.filter((r) => mine.has(r.sender_team_id) && !incomingIds.has(r.id));

    root.append(
      h('section', { class: 'request-section panel' },
        h('h2', { class: 'section-title', text: 'Requests to you' }),
        incoming.length ? h('ul', {}, incoming.map(requestRow)) : emptyNote('No one has asked your teams for a game yet.')),
      h('section', { class: 'request-section panel' },
        h('h2', { class: 'section-title', text: 'Requests you sent' }),
        sent.length ? h('ul', {}, sent.map(requestRow)) : emptyNote('You have not sent any requests.')));
  }

  async function respondToRequest(id, status, ...buttons) {
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await api(`/game-requests/${id}`, { method: 'PATCH', body: { status } });
      await Promise.all([refreshRequests(), loadTeamData()]);
      render();
      toast(status === 'Accepted' ? 'Game accepted and added to both schedules.' : 'Request declined.');
    } catch (error) {
      buttons.forEach((b) => { b.disabled = false; });
      toast(error.message, 'error');
      if (error.status === 409) { await refreshRequests(); render(); }
    }
  }

  /* ------------------------------------------------------------------ *
   * Rendering and routing
   * ------------------------------------------------------------------ */

  const VIEWS = {
    overview: { title: 'Overview', render: renderOverview },
    schedule: { title: 'Schedule', render: renderSchedule },
    roster: { title: 'Roster', render: renderRoster },
    announcements: { title: 'Announcements', render: renderAnnouncements },
    requests: { title: 'Game requests', render: renderRequests },
  };

  function renderChrome() {
    const team = activeTeam();
    $('#team-title').textContent = team ? team.name : `Welcome, ${state.user.name}`;
    $('#team-sub').textContent = team
      ? team.sport
      : (isOwner() ? 'Set up your first team to get started.' : 'Waiting for a roster spot.');

    const select = $('#team-select');
    select.replaceChildren(...state.teams.map((t) => h('option', { value: t.id, text: t.name })));
    if (state.teamId) select.value = String(state.teamId);
    $('#team-switch').hidden = !(isOwner() ? state.teams.length > 0 : state.teams.length > 1);
    $('#new-team-btn').hidden = !isOwner();

    const pending = isOwner() ? pendingIncoming().length : 0;
    const badge = $('#requests-count');
    badge.hidden = pending === 0;
    badge.textContent = pending;
    badge.setAttribute('aria-label', `${pending} awaiting reply`);
  }

  function renderView() {
    for (const [name, node] of Object.entries(viewNodes)) {
      node.hidden = name !== state.view;
      if (name !== state.view) node.replaceChildren(); // drop stale DOM from views not on screen
    }
    $$('#side-nav a').forEach((a) => {
      if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = `${VIEWS[state.view].title} | TeamBase`;

    const root = viewNodes[state.view];
    root.replaceChildren();
    if (!activeTeam()) { root.append(noTeamPanel()); return; }
    VIEWS[state.view].render(root);
  }

  function render() {
    renderChrome();
    renderView();
  }

  function viewFromHash() {
    const name = window.location.hash.slice(1);
    if (!VIEWS[name]) return 'overview';
    if (name === 'requests' && !isOwner()) return 'overview';
    return name;
  }

  function route() {
    state.view = viewFromHash();
    render();
  }

  const viewNodes = {};

  /* ------------------------------------------------------------------ *
   * Dialogs
   * ------------------------------------------------------------------ */

  function wireDialog(id, onSubmit) {
    const dialog = $(`#${id}`);
    const form = $('form', dialog);
    const message = $('.form-message', dialog);

    $$('[data-close]', dialog).forEach((b) => b.addEventListener('click', () => dialog.close()));
    // A click on the backdrop lands on the <dialog> element itself.
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { message.textContent = ''; form.reset(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      message.textContent = '';
      const submit = $('[type="submit"]', form);
      submit.disabled = true;
      try {
        await onSubmit(new FormData(form));
        dialog.close();
      } catch (error) {
        message.textContent = error.message;
        message.dataset.state = 'error';
      } finally {
        submit.disabled = false;
      }
    });
    return dialog;
  }

  const optionList = (teams, placeholder) => [
    placeholder ? h('option', { value: '', text: placeholder }) : null,
    ...teams.map((t) => h('option', { value: t.id, text: `${t.name} (${t.sport})` })),
  ];

  function openTeamDialog() { $('#dlg-team').showModal(); }

  async function openEventDialog({ date, type } = {}) {
    const dialog = $('#dlg-event');
    $('#dlg-event-lede').textContent = `Adding to ${activeTeam().name}.`;
    if (date) $('#event-date').value = date;
    if (type) $(`input[name="event_type"][value="${type}"]`, dialog).checked = true;
    syncOpponentField();
    fillOpponents($('#event-opponent'), state.teamId, 'No specific opponent');
    dialog.showModal();

    // Opponent list can be stale if other owners created teams since page load.
    try { state.allTeams = (await api('/teams')).teams; } catch { /* keep the cached list */ }
    fillOpponents($('#event-opponent'), state.teamId, 'No specific opponent');
  }

  function fillOpponents(select, excludeId, placeholder) {
    const current = select.value;
    const others = state.allTeams.filter((t) => t.id !== Number(excludeId));
    select.replaceChildren(...optionList(others, placeholder));
    if (current && others.some((t) => String(t.id) === current)) select.value = current;
  }

  function syncOpponentField() {
    const isGame = $('input[name="event_type"]:checked', $('#dlg-event')).value === 'Game';
    $('#event-opponent-field').hidden = !isGame;
  }

  function openPlayerDialog() {
    $('#dlg-player-lede').textContent = `Adding to ${activeTeam().name}.`;
    $('#dlg-player').showModal();
  }

  function openPostDialog() {
    $('#dlg-post-lede').textContent = `Everyone on ${activeTeam().name} will see this.`;
    $('#dlg-post').showModal();
  }

  async function openRequestDialog() {
    const dialog = $('#dlg-request');
    const teamSelect = $('#request-team');
    teamSelect.replaceChildren(...state.teams.map((t) => h('option', { value: t.id, text: t.name })));
    teamSelect.value = String(state.teamId);

    const minDate = ymd(new Date());
    $('#request-date').min = minDate;

    fillOpponents($('#request-opponent'), teamSelect.value, '');
    dialog.showModal();

    try { state.allTeams = (await api('/teams')).teams; } catch { /* keep the cached list */ }
    fillOpponents($('#request-opponent'), teamSelect.value, '');
    const opponentSelect = $('#request-opponent');
    if (!opponentSelect.options.length) {
      $('.form-message', dialog).textContent = 'There are no other teams to play yet. Ask another owner to create one.';
    }
  }

  function wireDialogs() {
    wireDialog('dlg-team', async (form) => {
      const { team } = await api('/teams', { method: 'POST', body: { name: form.get('name'), sport: form.get('sport') } });
      await loadAll(team.id);
      window.location.hash = '#overview';
      render();
      toast(`${team.name} created.`);
    });

    wireDialog('dlg-event', async (form) => {
      const type = form.get('event_type');
      const body = {
        event_type: type,
        event_date: form.get('event_date'),
        event_time: form.get('event_time'),
        location: form.get('location'),
      };
      if (String(form.get('title')).trim()) body.title = form.get('title');
      if (type === 'Game' && form.get('opponent_team_id')) body.opponent_team_id = Number(form.get('opponent_team_id'));

      await api(`/teams/${state.teamId}/events`, { method: 'POST', body });
      await loadTeamData();
      // Jump the calendar to the new event so the person sees it land.
      state.schedule.month = firstOfMonth(parseYmd(body.event_date));
      state.schedule.selectedDay = dateOnly(body.event_date);
      render();
      toast(`${type} added to the schedule.`);
    });

    $$('input[name="event_type"]', $('#dlg-event')).forEach((r) => r.addEventListener('change', syncOpponentField));
    $('#switch-to-request').addEventListener('click', () => {
      $('#dlg-event').close();
      openRequestDialog();
    });

    wireDialog('dlg-player', async (form) => {
      const body = {
        name: form.get('name'),
        jersey_number: Number(form.get('jersey_number')),
        position: form.get('position'),
      };
      if (String(form.get('email')).trim()) body.email = String(form.get('email')).trim();
      await api(`/teams/${state.teamId}/roster`, { method: 'POST', body });
      await loadTeamData();
      render();
      toast(`${body.name} added to the roster.`);
    });

    wireDialog('dlg-post', async (form) => {
      await api(`/teams/${state.teamId}/posts`, { method: 'POST', body: { title: form.get('title'), content: form.get('content') } });
      await loadTeamData();
      render();
      toast('Announcement posted.');
    });

    wireDialog('dlg-request', async (form) => {
      const opponent = form.get('opponent_team_id');
      if (!opponent) throw new Error('Choose an opponent.');
      await api('/game-requests', {
        method: 'POST',
        body: {
          team_id: Number(form.get('team_id')),
          opponent_team_id: Number(opponent),
          proposed_date: form.get('proposed_date'),
          proposed_time: form.get('proposed_time'),
          location: form.get('location'),
        },
      });
      await refreshRequests();
      render();
      toast('Game request sent.');
    });

    // Changing "your team" changes who can be the opponent.
    $('#request-team').addEventListener('change', (e) => fillOpponents($('#request-opponent'), e.target.value, ''));
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  async function switchTeam(id) {
    state.teamId = id;
    saveTeam(id);
    const main = $('#main');
    main.classList.add('is-loading');
    clearBanner();
    try {
      await loadTeamData();
    } catch (error) {
      showBanner(error.message, () => switchTeam(id));
    } finally {
      main.classList.remove('is-loading');
      render();
    }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* leave anyway */ }
    window.location.assign('/login.html');
  }

  async function init() {
    for (const name of Object.keys(VIEWS)) viewNodes[name] = $(`#view-${name}`);

    try {
      const { user } = await api('/auth/me');
      state.user = user;
    } catch {
      return; // api() already redirected to the login page on 401
    }

    document.body.dataset.role = state.user.role.toLowerCase();
    $('#user-name').textContent = state.user.name;
    $('#user-role').textContent = ROLE_LABEL[state.user.role] || state.user.role;

    $('#logout-btn').addEventListener('click', logout);
    $('#new-team-btn').addEventListener('click', openTeamDialog);
    $('#team-select').addEventListener('change', (e) => switchTeam(Number(e.target.value)));
    window.addEventListener('hashchange', route);
    if (isOwner()) wireDialogs();

    const load = async () => {
      clearBanner();
      try {
        await loadAll();
      } catch (error) {
        showBanner(error.message, load);
      }
      $('#loading').hidden = true;
      route();
    };
    await load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();