// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the git
// state where its first terminal is now: branch, uncommitted changes, ahead/behind.
// Agent state lives in the agents list, not here (only a folded group sums it up).
// Click to switch, right-click for its menu (Pull / Push run here: see sync), drag to reorder.
//
// mttnb's copy of Herdr's spaces mod (mod.clone): a space can have its own icon (an
// emoji or a picture) and spaces can sit in folding groups, each with a name and an
// icon. Drag a space onto a group's header to put it there. The menus and dialogs are
// this mod too, opened with props.view (edit.js).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, terminals, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, props, nextCommand, notify } from "herdr";
import { icons, groups, updateGroup, moveToGroup, iconTile, identicon, fillOf } from "./store.js";
import { Editor, openGroup } from "./edit.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// The most urgent of some agent statuses; idle and none count as nothing.
const URGENT = ["blocked", "done", "working"];
const urgent = (statuses) => URGENT.find((s) => statuses.includes(s)) ?? null;

// Each space's Coding column agents' statuses (mttnb-desk): they have no pane, so a
// space's own status leaves them out.
function deskStatuses() {
  const listed = new Map(agents().map((a) => [a.address, a.status]));
  const out = {};
  for (const k of terminals()) {
    if (k.state !== "live" || k.labels?.["mttnb.role"] !== "desk") continue;
    const s = listed.get(k.address) ?? k.status;
    (out[k.labels["mttnb.space"]] ??= []).push(s === "error" ? "blocked" : s);
  }
  return out;
}

// A group's spaces hang off a line under its header's chevron, 13px in: from the
// header down, a branch to each space, ending at the last one.
const GUIDE = -7; // the line, from a grouped row's left edge (it sits 20px in)
const guide = (el, t) => el.absolute().bg(t.dim).opacity(0.45);

export default class Spaces extends View {
  init(_props, cx) {
    if (props()?.view) { this.editor = new Editor(cx); return; }
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    this.syncing = {}; // space -> "pull" | "push" while it runs
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.overGroup = null; // the group header a dragged space is over
    this.machines = [];
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
    // "pull:<space>" / "push:<space>" from the space menu (an overlay: it can't
    // wait for git itself, its tasks end when it closes).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const at = c.indexOf(":");
        const [action, id] = [c.slice(0, at), c.slice(at + 1)];
        if (action === "pull" || action === "push") this.sync(action, id, cx);
      }
    });
  }

  // Pulls (fast-forward only) or pushes where the space is now; a branch with no
  // upstream yet is pushed to origin and tracks it. Says how it went in a toast.
  sync(action, id, cx) {
    const s = spaces().find((x) => x.id === id);
    if (!s || this.syncing[id]) return;
    const key = where(s, panes());
    const [on, cwd] = JSON.parse(key);
    this.syncing[id] = action;
    cx.notify();
    cx.spawn(async (cx) => {
      // No prompt can be answered here: asking for a password fails instead of waiting.
      const git = (...args) => exec("env", ["GIT_TERMINAL_PROMPT=0", "git", ...args], { cwd, on });
      let r;
      try {
        r = await git(...(action === "pull" ? ["pull", "--ff-only"] : ["push"]));
        if (action === "push" && r.code !== 0 && /no upstream branch/i.test(r.stderr)) r = await git("push", "-u", "origin", "HEAD");
      } catch (e) {
        r = { code: -1, stdout: "", stderr: String(e?.message ?? e) };
      }
      delete this.syncing[id];
      const said = (r.code === 0 ? r.stdout || r.stderr : r.stderr || r.stdout).trim().split("\n").filter(Boolean);
      notify(r.code === 0
        ? { title: `${action === "pull" ? "Pulled" : "Pushed"} ${s.name}`, body: said.at(-1) ?? "", level: "success", timeout: 4000 }
        : { title: `Couldn't ${action} ${s.name}`, body: said.slice(-3).join("\n"), level: "error" });
      this.refreshGit(this.sameRepo(key, Object.keys(this.git)), cx);
      cx.notify();
    });
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, oid: null, changes: 0, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (!line) continue;
        if (!line.startsWith("#")) info.changes += 1; // a changed, unmerged or untracked path
        else if (line.startsWith("# branch.head ")) info.branch = line.slice(14) === "(detached)" ? null : line.slice(14);
        else if (line.startsWith("# branch.oid ")) info.oid = line.slice(13);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "mttnb-spaces", kind: "popup", width: 220, height: 420, props: { view: "space-menu", space: w.id } });
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : this.withGroups(rows, t, collapsed, true);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const machine = this.machines.find(k => k.name === m);
      const connected = !m || machine?.state === "connected";
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", m ? { machine: m } : {}); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", m ? { machine: m } : {}))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      return [head, ...(folded ? [] : mine.length ? this.withGroups(mine, t, collapsed, m === null) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // One machine's rows: each group's header with its spaces under it, then, past a
  // divider, the spaces in no group. A worktree row stays under the space above it.
  // Empty groups show on this computer's list only; the narrow rail lists every space flat.
  withGroups(rows, t, collapsed, local) {
    if (collapsed) return rows.map((r) => this.compact(r, t));
    const units = [];
    for (const r of rows) {
      if (r.tree && units.length) units[units.length - 1].push(r);
      else units.push([r]);
    }
    const list = groups();
    const groupOf = (u) => list.find((g) => g.spaces.includes(u[0].w.id))?.id ?? null;
    const out = [];
    for (const g of list) {
      const mine = units.filter((u) => groupOf(u) === g.id);
      if (!mine.length && !local) continue;
      // A space branches off the line (the last one ends it); a worktree under a space
      // that isn't the last lets the line pass by.
      const kids = g.folded ? [] : mine.flatMap((u, n) => {
        const last = n === mine.length - 1;
        return u.map((r) => this.row(r, t, g.id, r.tree ? (last ? null : "pass") : last ? "last" : "mid"));
      });
      out.push(v_flex().id(`group-block-${g.id}`).flex_none().when(out.length > 0, (el) => el.mt(6))
        .child(this.groupHead(g, mine, t)).children(kids));
    }
    const loose = units.filter((u) => !groupOf(u));
    if (out.length && loose.length) out.push(div().flex_none().h(1).mx(8).mt(7).mb(6).bg(t.border));
    for (const u of loose) for (const r of u) out.push(this.row(r, t, null));
    return out;
  }

  // A group's header: a click folds or unfolds it, a dragged space dropped on it joins it,
  // right-click for its menu. Folded with the shown space inside, it shows as selected,
  // and what its spaces would show adds up after its name: the most urgent agent, then
  // their uncommitted changes, commits to push and to pull.
  groupHead(g, units, t) {
    const rows = units.flat();
    const holdsShown = g.folded && rows.some((r) => r.w.active);
    const target = this.pressed !== null && this.overGroup === g.id;
    const sum = (k) => rows.reduce((n, r) => n + (r.g?.[k] ?? 0), 0);
    const status = g.folded ? urgent(rows.flatMap((r) => [r.w.status, ...(this.desks[r.w.id] ?? [])])) : null;
    const changes = g.folded ? sum("changes") : 0, ahead = g.folded ? sum("ahead") : 0, behind = g.folded ? sum("behind") : 0;
    return h_flex().relative().id(`group-${g.id}`).h(30).flex_none().px(8).gap(7).items_center().rounded(8)
      .border_1().border_color(target ? t.accent : "#00000000")
      .when(holdsShown, (el) => el.bg(t.selected))
      .when(!holdsShown, (el) => el.hover((s) => s.bg(t.hover)))
      .on_mouse_move((_e, cx) => {
        if (this.pressed !== null && this.overGroup !== g.id) { this.overGroup = g.id; this.over = null; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        this.pressed = null;
        this.over = null;
        this.overGroup = null;
        if (from !== null && spaces()[from]) moveToGroup(spaces()[from].id, g.id);
        else updateGroup(g.id, { folded: !g.folded });
        cx.notify();
      })
      .on_mouse_down("right", () => openOverlay({ mod: "mttnb-spaces", kind: "popup", width: 200, height: 180, props: { view: "group-menu", group: g.id } }))
      // Inside the header's 1px border: 12 is 13 in, -1 reaches the header's bottom edge.
      .when(!g.folded && rows.length > 0, (el) => el.child(guide(div(), t).left(12).top(21).bottom(-1).w(1)))
      .child(svg(`mods/workspace-chrome/chevron-${g.folded ? "right" : "down"}.svg`).size(11).flex_none().text_color(t.dim))
      .child(iconTile(g.icon, 16, svg("mods/workspace-chrome/folder.svg").size(15).flex_none().text_color(t.muted)))
      .child(div().flex_shrink(1).min_w(0).truncate().text_color(t.foreground).font_medium().child(g.name))
      .when(status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(status === "blocked" || status === "done", (el) => el.child(div().size(6).flex_none().rounded(3).bg(t[status])))
      .child(h_flex().flex_1().min_w(0).gap(5).justify_end().items_center().text_size(11.5)
        .when(changes > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`\u25cf${changes}`)))
        .when(ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${ahead}`)))
        .when(behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${behind}`))))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(String(units.length)));
  }

  // After the name: the branch (a worktree's only when its name doesn't already say it;
  // a short commit when detached), then uncommitted changes, to push, to pull.
  gitTail(g, tree, name, t) {
    const branch = g.branch ?? g.oid?.slice(0, 7) ?? "detached";
    const said = tree && branch.toLowerCase() === name.toLowerCase();
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(!said, (el) => el.child(div().min_w(0).truncate().child(branch)))
      .when(g.changes > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`\u25cf${g.changes}`)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  // `group`: the group the row is listed in (null: none), indented under its header;
  // `line`: how its group's line passes the row ("mid", "last", "pass", null: not at all).
  row({ w, i, g, tree }, t, group, line = null) {
    const on = w.active;
    const fill = fillOf(t, (shared("space.colors") ?? {})[w.id]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .when(Boolean(group), (el) => el.ml(20).pl(6))
      .when(!group, (el) => el.pl(8))
      .pr(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && (this.over !== over || this.overGroup !== null)) {
          this.over = over;
          this.overGroup = null;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === i && from !== i) {
          // Dropped among a group's spaces (or the ungrouped ones), it goes there too.
          const id = spaces()[from].id;
          run("space.move", { id, index: i + 1 });
          if ((groups().find((x) => x.spaces.includes(id))?.id ?? null) !== group) moveToGroup(id, group);
        } else if (from === i) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .when(line === "mid" || line === "pass", (el) => el.child(guide(div(), t).left(GUIDE).top(0).bottom(0).w(1)))
      .when(line === "mid", (el) => el.child(guide(div(), t).left(GUIDE + 1).top(14).w(-GUIDE - 1).h(1)))
      .when(line === "last", (el) => el.child(div().absolute().left(GUIDE).top(0).h(15).w(-GUIDE).border_l_1().border_b_1().border_color(t.dim).opacity(0.45).rounded_bl(5)))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
          .when(!tree, el => el.child(iconTile(icons()[w.id], 18, identicon(w.id, 18, fill))))
          .child(div().flex_shrink(0).max_w(group ? 100 : 118).truncate().text_color(t.foreground).child(w.name))
          .when(Boolean(this.syncing[w.id]), (el) => el.child(svg(`mods/mttnb-spaces/${this.syncing[w.id]}.svg`).size(12).flex_none().text_color(t.working).loop("opacity", { from: 1, to: 0.3, period: 1100 })))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1()),
      );
  }

  compact({ w, i }, t) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  render(cx) {
    if (this.editor) return this.editor.render(cx);
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    this.desks = deskStatuses();
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child(div().flex_1().child("Spaces"))
          .child(div().id("group-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => openGroup({})).child(svg("mods/workspace-chrome/folder-plus.svg").size(14))))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.overGroup = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
