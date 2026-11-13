// mttnb desk: the coding column on the left of the work area. Each tab has its own desk
// agents there, beside its terminals on the right; a new tab starts with an empty desk.
// The header shows one tab per desk agent and a + that opens the picker, which lists
// every agent Herdr knows (knownAgents(): installed ones first); a click starts one more.
// All desk agents keep running; the column shows the shown tab's chosen one.
//
// A desk agent is an hc terminal with no parent and no pane, labelled mttnb.role=desk,
// mttnb.space=<space id> and mttnb.tab=<tab id>: closing panes never touches it (Herdr
// hangs up an agent's sub-agents with its pane), and it ends with its tab. It shows in a terminal
// block of its own in the layout's `desk-stack`, `desk-<address>` (one block per desk,
// never repointed: a shared block could show a desk blank until its agent redrew).
//
// props.role: "header" (default) draws the column's header, keeps the stack in step with
// the shown tab and takes key commands; "picker" is the agent list shown with no desk;
// "spare" is a never-shown second child that keeps `desk-stack` from having only one
// (Herdr folds a one-child container into its child when it saves the layout).
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  agents, appHome, exec, focused, home, knownAgents, layout, machines, nextCommand, notify, panes,
  playSound, props, readTextFile, run, settings, setShared, shared, spaces, terminals, theme, window,
} from "herdr";

const FOCUS = "mttnb.desk.focus"; // shared: the desk address to put the keyboard in once its block shows
const PICK = "mttnb.desk.pick";   // shared: bumped to put the keyboard in the picker
const CHOSEN = "mttnb.desk.chosen"; // shared: { tab id: desk address | "picker" }, what each tab's column shows

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

const isDesk = (t) => t.state === "live" && t.labels?.["mttnb.role"] === "desk";

// The tab a desk belongs to. Desks started before desks went by tab have only
// mttnb.space: they belong to their space's first tab.
function tabOfDesk(t) {
  return t.labels?.["mttnb.tab"]
    ?? spaces().find((s) => s.id === t.labels?.["mttnb.space"])?.tabs?.[0]?.id ?? null;
}

// A tab's live desk agents, oldest first.
function desksOf(tabId) {
  return terminals().filter((t) => isDesk(t) && tabOfDesk(t) === tabId);
}

// The desk the tab's column shows: the chosen one while it lives, else the first;
// null for the picker.
function chosenDesk(tabId, desks) {
  const pick = (shared(CHOSEN) ?? {})[tabId];
  if (pick === "picker") return null;
  return desks.find((d) => d.address === pick) ?? desks[0] ?? null;
}

function choose(tabId, value) {
  setShared(CHOSEN, { ...(shared(CHOSEN) ?? {}), [tabId]: value });
}

// { space, tab }: where a tab is.
function placeOfTab(tabId) {
  for (const space of spaces()) {
    const tab = space.tabs.find((x) => x.id === tabId);
    if (tab) return { space, tab };
  }
  return null;
}

// The shown space and tab.
function shownPlace() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space);
  const tab = space?.tabs.find((x) => x.id === f?.tab) ?? space?.tabs.find((x) => x.active);
  return space && tab ? { space, tab } : null;
}

// The tab a terminal belongs to: a desk's by its labels, else its pane's.
function placeOfTerminal(address) {
  const t = terminals().find((x) => x.address === address);
  const tab = t && t.labels?.["mttnb.role"] === "desk" ? tabOfDesk(t) : panes().find((p) => p.terminal === address)?.tab;
  return tab ? placeOfTab(tab) : null;
}

// Where new desk agents start: the tab's first terminal's shell's folder (a program in
// front of it, a dev server or a script in a temp folder, may run elsewhere), else where
// the space was created. mttnb-spaces shares root folders in mttnb-spaces.shells.
function folderOf(place) {
  const shells = shared("mttnb-spaces.shells") ?? {};
  const own = panes().filter((p) => p.tab === place.tab.id && p.terminal);
  return own.map((p) => shells[p.pane]).find(Boolean) || place.space.folder || home();
}

const tildify = (path) => (path && path.startsWith(home()) ? `~${path.slice(home().length)}` : path ?? "");

// A folder as the column shows it: ~ for home, /tmp for macOS's /private/tmp, and past
// `max` characters its middle folders folded into "…" (~/dev/…/web/dashboard).
function shortPath(path, max = 40) {
  const p = tildify(path).replace(/^\/private(?=\/(tmp|var)(\/|$))/, "");
  if (p.length <= max) return p;
  const parts = p.split("/");
  const head = parts[0] === "" ? `/${parts[1]}` : parts[0];
  const rest = parts.slice(parts[0] === "" ? 2 : 1);
  let tail = rest.pop();
  while (rest.length > 1 && `${head}/…/${rest.at(-1)}/${tail}`.length <= max) tail = `${rest.pop()}/${tail}`;
  return rest.length ? `${head}/…/${tail}` : p;
}

function keyLabel(stroke) {
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super" };
  const parts = stroke.split("-");
  const key = parts.pop();
  return [...parts.map((m) => names[m] ?? m), key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)].join(mac ? "" : "+");
}

let loginShell = null;
async function userShell() {
  if (loginShell) return loginShell;
  try {
    const r = await exec("sh", ["-c", 'printf %s "$SHELL"']);
    loginShell = r.stdout.trim() || "/bin/zsh";
  } catch { loginShell = "/bin/zsh"; }
  return loginShell;
}

// notify() only draws a toast inside the window, so the macOS banner comes from osascript
// (title and body as arguments, never spliced into the script).
function systemNote(title, body) {
  if (window()?.platform !== "macos") return;
  exec("osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)",
    "-e", "end run", title, body]).catch(() => {});
}

// The agent runs in the person's interactive login shell, as Herdr's own + menu starts
// agents: their PATH, version managers and shell functions all apply. The shell ends
// with the agent, and its tab leaves the header.
async function deskArgv(run) {
  const sh = await userShell();
  const wrap = /fish$/.test(sh) ? [sh, "-l", "-i", "-c", "$argv"] : [sh, "-l", "-i", "-c", '"$@"', "mttnb-desk"];
  return ["/usr/bin/env", "TERM=xterm-256color", "COLORTERM=truecolor", ...wrap, ...run];
}

const starting = new Set(); // tab ids with an hc run in flight

async function startDesk(place, agent) {
  if (!place || !agent?.installed || starting.has(place.tab.id)) return;
  const { space, tab } = place;
  if (space.machine) {
    notify({ title: "mttnb", body: "The Coding column only works for spaces on this computer for now.", level: "warning" });
    return;
  }
  starting.add(tab.id);
  try {
    const pane = panes().find((p) => p.tab === tab.id && p.terminal);
    if (pane) {
      const terminal = await exec("hc", ["get", pane.terminal, "--json"]);
      if (terminal.code !== 0) throw new Error(terminal.stderr || terminal.stdout);
      const { pid } = JSON.parse(terminal.stdout);
      if (!Number.isInteger(pid) || pid <= 0) throw new Error("Terminal has no live root process");
      const cwd = await exec("sh", ["-c", `readlink "/proc/$1/cwd" 2>/dev/null || lsof -a -d cwd -p "$1" -Fn 2>/dev/null | sed -n 's/^n//p'`, "sh", String(pid)]);
      if (cwd.code !== 0 || !cwd.stdout.trim()) throw new Error(cwd.stderr || "Could not read terminal root folder");
      setShared("mttnb-spaces.shells", { ...(shared("mttnb-spaces.shells") ?? {}), [pane.pane]: cwd.stdout.trim() });
    }
    const r = await exec("hc", ["run", "--bg", "--json", "--keep", "--no-parent", "--no-notify",
      "--cwd", folderOf(place),
      "--label", "mttnb.role=desk", "--label", `mttnb.space=${space.id}`, "--label", `mttnb.tab=${tab.id}`,
      "--label", `mttnb.agent=${agent.key}`,
      "--", ...(await deskArgv(agent.run))]);
    if (r.code !== 0) throw new Error(r.stderr || r.stdout);
    const address = JSON.parse(r.stdout).address;
    if (address) { choose(tab.id, address); setShared(FOCUS, address); }
  } catch (e) {
    notify({ title: `mttnb: ${agent.name} didn't start`, body: String(e?.message ?? e), level: "error" });
  } finally {
    starting.delete(tab.id);
  }
}

function programIcon(p, size, t) {
  const tile = div().size(size).flex_none().rounded(Math.round(size * 0.28)).flex().items_center().justify_center()
    .bg(p.tile ?? t.raised);
  if (!p.icon) return tile.text_size(size * 0.5).font_semibold().text_color(p.color ?? t.foreground).child((p.name ?? "?").slice(0, 1).toUpperCase());
  const glyph = Math.round(size * 0.62);
  return tile.child(p.tint ? svg(p.icon).size(glyph).text_color(p.color ?? t.foreground) : image(p.icon).size(glyph));
}

export default class MttnbDesk extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "header";
    this.recent = new Map(); // tab id -> the tab's pane the keyboard was last in
    this.lastDesk = new Map(); // tab id -> the desk its column last showed (to go back to from the picker)
    this.confirmEnd = 0;  // when "end" was clicked once (ms): a second click within 3s ends the desk agent
    this.showMissing = localStorage.getItem("picker.missing") === "open"; // the not-installed agents, folded at first
    if (this.role === "spare") return;
    if (this.role === "picker") {
      this.agents = null;
      this.handle = cx.focus_handle();
      this.pick = shared(PICK);
      this.loadAgents(cx);
      // knownAgents() answers from a one-minute cache: pick up agents installed meanwhile.
      cx.timer.every(60000, (cx) => this.loadAgents(cx));
      return;
    }
    // Herdr doesn't render the header while the window is in the back, so alerts
    // look for status changes on a timer (reading only: it redraws nothing).
    cx.timer.every(1000, () => this.alertChanges());
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        await this.command(c);
        cx.notify();
      }
    });
  }

  loadAgents(cx) {
    cx.spawn(async (cx) => {
      try { this.agents = await knownAgents(); this.failed = false; } catch { this.failed = true; }
      cx.notify();
    });
  }

  // "<command>" acts on the shown tab; "<command>:<terminal>" on that terminal's tab
  // (`agent:<desk>` from the agents list shows and focuses that desk).
  async command(raw) {
    const [c, address] = raw.split(":");
    const place = address ? placeOfTerminal(address) : shownPlace();
    if (!place) return;
    const desks = desksOf(place.tab.id);
    const named = desks.find((d) => d.address === address);
    const desk = named ?? chosenDesk(place.tab.id, desks);
    switch (c) {
      case "agent": {
        // From the picker, back to the agent the column showed before it.
        const back = desk ?? desks.find((d) => d.address === this.lastDesk.get(place.tab.id)) ?? desks[0];
        if (back) this.focusDesk(place, back);
        else this.openPicker(place);
        break;
      }
      case "new":
        this.openPicker(place);
        break;
      case "next":
      case "prev": {
        if (!desks.length) break;
        const i = desk ? desks.indexOf(desk) : -1;
        const step = c === "next" ? 1 : -1;
        this.focusDesk(place, desks[(i < 0 ? (step > 0 ? 0 : desks.length - 1) : i + step + desks.length) % desks.length]);
        break;
      }
      case "end":
        if (desk) run("terminal.kill", { terminal: desk.address });
        break;
      case "go-left":
      case "go-right":
        this.go(c.slice(3), desks, desk);
        break;
    }
  }

  // Selects the place's space and tab when another one shows.
  show(place) {
    const f = focused();
    if (f?.space !== place.space.id) run("space.select", { id: place.space.id });
    if (f?.tab !== place.tab.id) run("tab.select", { id: place.tab.id });
  }

  openPicker(place) {
    this.show(place);
    choose(place.tab.id, "picker");
    setShared(PICK, Date.now());
  }

  // Shows the desk (selecting its tab) and puts the keyboard in it once its block shows.
  focusDesk(place, desk) {
    this.show(place);
    choose(place.tab.id, desk.address);
    // A block that isn't shown yet can't take the keyboard: sync() focuses it once it shows.
    if (focused()?.tab === place.tab.id && findNode(layout(), "desk-stack")?.active === `desk-${desk.address}`) {
      run("pane.focus", { terminal: desk.address });
    } else {
      setShared(FOCUS, desk.address);
    }
  }

  // Ctrl+Alt+Left/Right. pane.go only moves among the tab's panes, which the desk column
  // isn't one of: in the desk, Right returns to the tab; Left with no pane further left
  // enters the desk, or the picker when the tab has no desk agent.
  go(direction, desks, desk) {
    const from = focused();
    if (!from?.pane && desks.some((d) => d.address === from?.terminal)) {
      if (direction === "right") this.backToTab(from.tab);
      return;
    }
    run("pane.go", { direction });
    if (direction !== "left" || focused()?.pane !== from?.pane) return;
    if (desk) run("pane.focus", { terminal: desk.address });
    else setShared(PICK, Date.now());
  }

  // Puts the keyboard in the tab's pane it was last in, else the tab's first pane.
  backToTab(tabId) {
    const own = panes().filter((p) => p.tab === tabId && p.terminal);
    const pane = own.find((p) => p.pane === this.recent.get(tabId)) ?? own[0];
    if (pane) run("pane.focus", { pane: pane.pane });
  }

  // Runs on every render (Herdr re-renders on any live change): keeps a block per desk of
  // the shown tab in `desk-stack`, adding missing ones, and shows the chosen one. The
  // app drops a block when its terminal ends; one it drops for a live desk is not added
  // again, so this can't loop.
  sync(place, cx) {
    if (!place) return { desks: [], desk: null };
    const desks = desksOf(place.tab.id);
    const desk = chosenDesk(place.tab.id, desks);
    const f = focused();
    if (f?.pane) this.recent.set(f.tab, f.pane);
    if (desk) this.lastDesk.set(place.tab.id, desk.address);
    this.deskFocused = Boolean(desk && !f?.pane && f?.terminal === desk.address);
    this.endOrphans();
    const stack = findNode(layout(), "desk-stack");
    if (!stack) return { desks, desk }; // a layout without the desk column: nothing to keep in step
    this.added ??= new Set();
    const kids = stack.children ?? [];
    const has = (bid) => kids.some((c) => c.id === bid);
    const live = new Set(terminals().filter((t) => t.state === "live").map((t) => t.address));
    const ended = (c) => c.id.startsWith("desk-") && !live.has(c.content?.terminal);
    const missing = desks.filter((d) => !has(`desk-${d.address}`) && !this.added.has(`desk-${d.address}`));
    const id = desk ? `desk-${desk.address}` : null;
    const want = id && (has(id) || missing.includes(desk)) ? id : "picker";
    if ((missing.length || kids.some(ended)) && cx && !this.writing) {
      for (const d of missing) this.added.add(`desk-${d.address}`);
      this.writing = true;
      cx.spawn(async (cx) => {
        try { await this.rewrite(missing, want, live); }
        catch (e) { console.log(`mttnb-desk: layout not updated: ${e}`); }
        this.writing = false;
        cx.notify();
      });
    } else if (stack.active !== want && has(want)) {
      run("layout.select", { stack: "desk-stack", child: want });
    }
    // A desk just started or picked takes the keyboard once its block shows.
    if (desk && shared(FOCUS) === desk.address && stack.active === id) {
      setShared(FOCUS, null);
      run("pane.focus", { terminal: desk.address });
    }
    return { desks, desk };
  }

  // Adds or drops desk blocks with layout.set. The tree comes from the layout file, not
  // layout(): layout() folds a column with one child into that child, and writing it back
  // would lose the `panel` column the tab bar's Files/Changes/Graph buttons show and hide.
  // Sizes, stack choices and shown/hidden come from layout(), so clicks aren't undone.
  async rewrite(missing, want, live) {
    const name = shared("layout");
    const text = await readTextFile(`${appHome()}/layouts/${name}.json`);
    if (!text) return;
    const tree = JSON.parse(text);
    const now = layout();
    (function keep(node) {
      const seen = findNode(now, node.id);
      if (seen?.size && node.size) node.size = seen.size;
      if (seen?.active && node.type === "stack") node.active = seen.active;
      if (seen?.hidden) node.hidden = true;
      else if (seen) delete node.hidden;
      for (const c of node.children ?? []) keep(c);
    })(tree);
    const stack = findNode(tree, "desk-stack");
    if (!stack) return;
    stack.children = (stack.children ?? []).filter((c) => !c.id.startsWith("desk-") || live.has(c.content?.terminal));
    for (const d of missing) {
      const id = `desk-${d.address}`;
      if (!stack.children.some((c) => c.id === id)) {
        stack.children.push({ id, type: "block", content: { terminal: d.address }, padding: [6, 6] });
      }
    }
    stack.active = stack.children.some((c) => c.id === want) ? want : "picker";
    run("layout.set", { layout: tree });
  }

  // Herdr's own alerts follow agents(), which leaves desks out (they have no pane), so the
  // column alerts for them: a sound and a macOS notification when one needs the person or
  // finishes (even while they're looking at it, unlike Herdr), and a toast (unless they're
  // looking) that goes there.
  // A desk seen for the first time only records its status: a reload doesn't alert.
  alertChanges() {
    this.statuses ??= new Map();
    const place = shownPlace();
    const shown = place ? chosenDesk(place.tab.id, desksOf(place.tab.id)) : null;
    const listed = new Set(agents().map((a) => a.address));
    const live = new Set();
    for (const d of terminals()) {
      if (!isDesk(d)) continue;
      live.add(d.address);
      const status = d.status === "error" ? "blocked" : d.status;
      const before = this.statuses.get(d.address);
      this.statuses.set(d.address, status);
      if (before === undefined || before === status || listed.has(d.address)) continue;
      if (status !== "blocked" && status !== "done") continue;
      const looking = Boolean(window()?.active && shown?.address === d.address && place?.tab.id === tabOfDesk(d));
      if (settings()?.sounds?.enabled !== false) playSound(status);
      const name = d.program?.name ?? "Agent";
      const where = placeOfTab(tabOfDesk(d));
      const title = status === "blocked" ? `${name} needs you` : `${name} finished`;
      const body = [where?.space.name, d.title].filter(Boolean).join(" · ");
      systemNote(title, body);
      if (looking) continue;
      notify({
        title,
        body,
        level: status === "blocked" ? "warning" : "success",
        action: { name: `mttnb-desk.agent:${d.address}` },
      });
    }
    for (const a of this.statuses.keys()) if (!live.has(a)) this.statuses.delete(a);
  }

  // A desk whose tab was closed ends with it. Only tabs this copy has seen go: while the
  // layout loads, spaces() can be empty or partial.
  endOrphans() {
    if (machines().find((m) => m.name === null)?.layout !== "ready") return;
    const tabs = new Set(spaces().flatMap((s) => s.tabs.map((x) => x.id)));
    this.seen ??= new Set();
    for (const i of tabs) this.seen.add(i);
    for (const t of terminals()) {
      if (!isDesk(t)) continue;
      const tab = t.labels?.["mttnb.tab"] ?? null;
      const sp = t.labels?.["mttnb.space"];
      const gone = tab ? this.seen.has(tab) && !tabs.has(tab) : this.seen.size > 0 && !spaces().some((s) => s.id === sp);
      if (gone) run("terminal.kill", { terminal: t.address });
    }
  }

  render(cx) {
    if (this.role === "spare") return div();
    return this.role === "picker" ? this.renderPicker(cx) : this.renderHeader(cx);
  }

  renderHeader(cx) {
    const t = theme();
    const place = shownPlace();
    const { desks, desk } = this.sync(place, cx);
    const bar = h_flex().size_full().pl(10).pr(8).gap(6).items_center().bg(t.chrome).text_size(12.5).text_color(t.muted)
      .border_b(1).border_color(this.deskFocused ? t.accent : t.border);
    if (!desks.length) {
      return bar
        .child(svg("mods/mttnb-desk/code.svg").size(14).flex_none().text_color(t.accent))
        .child(div().text_color(t.foreground).font_semibold().child("Coding"))
        .child(div().id("desk-folder").flex_1().truncate().text_color(t.dim)
          .when(Boolean(place), (el) => el.tooltip(tildify(folderOf(place))).child(shortPath(folderOf(place)))));
    }
    // Same program twice: "Claude Code", "Claude Code 2".
    const seen = {};
    const labels = desks.map((d) => {
      const name = (agents().find((a) => a.address === d.address)?.program ?? d.program)?.name ?? "agent";
      seen[name] = (seen[name] ?? 0) + 1;
      return seen[name] > 1 ? `${name} ${seen[name]}` : name;
    });
    const picking = !desk;
    const confirming = Date.now() - this.confirmEnd < 3000;
    return bar
      .child(h_flex().id("desk-tabs").flex_1().min_w(0).h_full().gap(3).items_center().overflow_x_scrollbar()
        .children(desks.map((d, i) => this.deskTab(place, d, labels[i], d === desk, t))))
      .child(h_flex().id("desk-new").size(24).flex_none().items_center().justify_center().rounded(6)
        .bg(picking ? t.selected : t.chrome).text_color(picking ? t.foreground : t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => this.openPicker(place))
        .child(svg("mods/mttnb-desk/add.svg").size(14)))
      .when(Boolean(desk), (el) => el.child(h_flex().id("desk-end").h(24).px(7).gap(4).flex_none().items_center().rounded(6)
        .text_size(11.5).text_color(confirming ? t.blocked : t.dim)
        .hover((s) => s.bg(t.hover).text_color(confirming ? t.blocked : t.foreground))
        .on_click((_e, cx) => {
          if (Date.now() - this.confirmEnd < 3000) { this.confirmEnd = 0; run("terminal.kill", { terminal: desk.address }); }
          else {
            this.confirmEnd = Date.now();
            cx.timer.after(3100, (cx) => cx.notify());
          }
          cx.notify();
        })
        .child(svg("mods/pane/close.svg").size(11))
        .child(confirming ? "Click again to end" : "End")));
  }

  // One desk agent in the header: its status, icon and name; a click shows it.
  deskTab(place, d, label, on, t) {
    const info = agents().find((a) => a.address === d.address);
    const program = info?.program ?? d.program;
    const status = info?.status ?? d.status;
    return h_flex().id(`desk-tab-${d.address}`).h(26).px(8).gap(6).flex_none().items_center().rounded(6)
      .border(1).border_color(on ? t.border : t.chrome).bg(on ? t.raised : t.chrome)
      .text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
      .on_click(() => this.focusDesk(place, d))
      .when(Boolean(program), (el) => el.child(programIcon(program, 15, t)))
      .child(div().max_w(150).truncate().child(label))
      .when(status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(status === "blocked" || status === "done", (el) => el.child(div().size(6).flex_none().rounded(3).bg(t[status])));
  }

  renderPicker() {
    const t = theme();
    const place = shownPlace();
    const space = place?.space;
    // Ctrl+Shift+A, or arrowing left from the leftmost pane, with no desk: the picker takes the keyboard.
    const pick = shared(PICK);
    if (pick !== this.pick) { this.pick = pick; this.handle.focus(); }
    const list = this.agents ?? [];
    const ready = list.filter((a) => a.installed);
    const missing = list.filter((a) => !a.installed);
    const remote = Boolean(space?.machine);
    const running = place ? desksOf(place.tab.id).length : 0;
    const dir = place ? shortPath(folderOf(place), 48) : "~";
    const row = (a, i) => {
      const on = a.installed && !remote;
      return h_flex().id(`agent-${a.key}`).h(46).px(10).gap(11).flex_none().items_center().rounded(8)
        .border(1).border_color(t.border).bg(t.surface)
        .when(on, (el) => el.hover((s) => s.bg(t.selected).border_color(t.accent))
          .on_click((_e, cx) => cx.spawn(async (cx) => { await startDesk(place, a); cx.notify(); })))
        .when(!on, (el) => el.opacity(0.5))
        .child(programIcon(a, 26, t))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_size(13).text_color(t.foreground).font_semibold().child(a.name))
          .child(div().truncate().text_size(11).text_color(t.dim).child(a.run.join(" "))))
        .child(div().flex_none().text_size(11).text_color(t.dim)
          .child(!a.installed ? "Not installed" : starting.has(place?.tab.id) ? "" : i < 9 ? String(i + 1) : ""));
    };
    const section = (label) => div().pt(10).pb(2).px(2).text_size(11).text_color(t.dim).child(label);
    // With nothing installed the list opens by itself: it's all there is to see.
    const open = this.showMissing || (this.agents !== null && !ready.length);
    const fold = h_flex().id("picker-missing").mt(8).h(26).px(2).gap(6).flex_none().items_center().rounded(6)
      .text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => {
        this.showMissing = !open;
        localStorage.setItem("picker.missing", this.showMissing ? "open" : "folded");
        cx.notify();
      })
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
      .child(`Not installed · ${missing.length}`)
      .when(!open, (el) => el.child(h_flex().flex_1().min_w(0).gap(4).justify_end().opacity(0.5)
        .children(missing.slice(0, 8).map((a) => programIcon(a, 16, t)))));
    return v_flex().id("picker").size_full().bg(t.background).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const agent = /^[1-9]$/.test(e.key) ? ready[Number(e.key) - 1] : null;
        if (agent) cx.spawn(async (cx) => { await startDesk(place, agent); cx.notify(); });
      })
      .child(v_flex().id("picker-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(18).py(18).gap(6)
        .child(h_flex().gap(10).items_center().pb(4)
          .child(svg("mods/mttnb-desk/code.svg").size(20).flex_none().text_color(t.accent))
          .child(v_flex().gap(2)
            .child(div().text_size(15).font_semibold().text_color(t.foreground).child(running ? "Start another agent" : "Pick an agent to start coding"))
            .child(div().text_size(11.5).text_color(t.dim)
              .child(remote ? "This space is on another machine: the Coding column only works on this computer for now."
                : running ? `${running} running in this tab: use the tabs above to switch back. A new one also starts in ${dir}.`
                : `Starts in ${dir}, in this tab. Terminals stay on the right.`))))
        .when(this.agents === null, (el) => el.child(div().py(8).text_size(12).text_color(t.dim).child(this.failed ? "Couldn't read the agent list" : "Looking for installed agents…")))
        .when(ready.length > 0, (el) => el.child(section(`Installed · ${ready.length}`)).children(ready.map(row)))
        .when(missing.length > 0, (el) => el.child(fold).when(open, (el) => el.children(missing.map((a) => row(a, 99))))))
      .child(h_flex().h(30).px(18).gap(14).flex_none().items_center().border_t(1).border_color(t.border)
        .text_size(11).text_color(t.dim)
        .child("1-9 start")
        .child(`${keyLabel("ctrl-alt-n")} new`)
        .child(`${keyLabel("ctrl-alt-up").replace(/Up$/, "↑↓")} switch`)
        .child(`${keyLabel("ctrl-alt-right")} terminals`));
  }
}
