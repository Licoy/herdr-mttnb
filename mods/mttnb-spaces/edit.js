// mttnb-spaces' overlays, opened as this mod with props.view:
// - "space-menu" { space }: Herdr's space menu items, Pull / Push (a repo with a remote), then the icon and the groups;
// - "group-menu" { group }: edit, move, delete a group;
// - "icon" { space }: a space's icon: its identicon, an emoji or a picture;
// - "group" { group? , space? }: a new group (with `space`, that space goes in it) or an existing one;
// - "new-space" { machine }: a new space in a folder typed, chosen with the system's picker or one used before.
// ↑/↓ and Enter in the menus, Esc closes.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Checkbox } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, spaces, panes, exec, home, appHome, window, shared, pickFolder } from "herdr";
import * as fs from "fs/promises";
import { icons, groups, groupOf, setIcon, updateGroup, moveToGroup, addGroup, removeGroup, moveGroup, recentFolders, addRecent, shownName, iconTile, identicon, fillOf } from "./store.js";

const EMOJI = ["🚀", "🔥", "⭐", "💡", "🧪", "🛠️", "📦", "🐛", "🎨", "📱", "🌐", "🗄️",
  "📊", "🤖", "🔒", "📝", "🧩", "⚡", "🌱", "🎯", "💼", "🏠", "🧠", "☁️"];
const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
const ICON_DIR = "data/mttnb-spaces/icons"; // under the Herdr home, where image() looks

const chrome = (name) => `mods/workspace-chrome/${name}.svg`;
const own = (name) => `mods/mttnb-spaces/${name}.svg`;
const close = () => closeOverlay(props()?.overlay);

// Where a space is now: where the list looked (its shell's folder, also while a
// program runs elsewhere), else its first terminal's live folder, else where it was made.
function place(s) {
  const seen = (shared("mttnb-spaces.places") ?? {})[s.id];
  if (seen) return JSON.parse(seen)[1];
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null; `remote`:
// the repo has one (something to pull from and push to).
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return { kind: null, remote: false };
  const remotes = await exec("git", ["remote"], { cwd: folder, on });
  return { kind: common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked", remote: remotes.stdout.trim() !== "" };
}

// Resolve on the target machine; only create missing folders with explicit consent.
async function resolveFolder(typed, on, createMissing) {
  const script = 'd=$1; case $d in "~") d=$HOME;; "~/"*) d=$HOME/${d#"~/"};; /*) ;; *) d=$HOME/$d;; esac; if [ "$2" = 1 ] && [ ! -d "$d" ]; then mkdir -p -- "$d" || exit; fi; unset CDPATH; cd -- "$d" && pwd';
  const r = await exec("sh", ["-c", script, "sh", typed, createMissing ? "1" : "0"], { on });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `Folder command exited with code ${r.code}`);
  const folder = r.stdout.trim();
  if (!folder) throw new Error("Folder command returned no path");
  return folder;
}

// Folders to offer a new space on that machine: the ones new spaces were made in, then the spaces' own.
function knownFolders(machine) {
  const seen = shared("mttnb-spaces.places") ?? {};
  const spaced = spaces().filter((s) => (s.machine ?? null) === machine)
    .map((s) => (seen[s.id] ? JSON.parse(seen[s.id])[1] : s.folder));
  return [...new Set([...recentFolders(machine), ...spaced].filter(Boolean))].slice(0, 8);
}

// A path as people read it: ~ for the home folder (here).
const tilde = (path, machine) => {
  const h = home();
  return !machine && h && (path === h || path.startsWith(`${h}/`)) ? `~${path.slice(h.length)}` : path;
};

// `machine`: where the space lives, null for this computer.
export function openNewSpace(machine) {
  openOverlay({ mod: "mttnb-spaces", kind: "dialog", width: 460, height: 440, props: { view: "new-space", machine: machine ?? null } });
}

export function openIcon(spaceId) {
  openOverlay({ mod: "mttnb-spaces", kind: "dialog", width: 420, height: 440, props: { view: "icon", space: spaceId } });
}

export function openGroup(change) {
  openOverlay({ mod: "mttnb-spaces", kind: "dialog", width: 420, height: 500, props: { view: "group", ...change } });
}

// Copies a picture into the Herdr home (image() reads only there) under a new name, so a
// changed picture never shows an old cached one. Resolves with its path there.
async function keepPicture(source) {
  const home = appHome().split("\\").join("/");
  const name = `${Date.now().toString(36)}${source.match(PICTURE)[0].toLowerCase()}`;
  await fs.mkdir(`${home}/${ICON_DIR}`, { recursive: true });
  try {
    await fs.writeFile(`${home}/${ICON_DIR}/${name}`, await fs.readFile(source));
  } catch {
    // fs reads only under the home folder: anywhere else, the system copies it.
    const r = await exec("cp", [source, `${home}/${ICON_DIR}/${name}`]);
    if (r.code !== 0) throw new Error(r.stderr);
  }
  return `${ICON_DIR}/${name}`;
}

const button = (t, id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
  .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
  .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
  .hover((s) => s.opacity(0.88)).on_click(action).child(text);
const field = (t, state) => Input.new(state).h(36).px(10).rounded(9).border_1().border_color(t.input).bg(t.background)
  .text_size(12.8).text_color(t.foreground);

export class Editor {
  constructor(cx) {
    const p = props() ?? {};
    this.view = p.view;
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (this.view === "space-menu") {
      this.git = null;
      this.remote = false;
      const space = spaces().find((s) => s.id === p.space);
      const folder = space && place(space);
      if (folder) cx.spawn(async (cx) => {
        const c = await checkout(folder, space.machine).catch(() => ({ kind: null, remote: false }));
        this.git = c.kind;
        this.remote = c.remote;
        cx.notify();
      });
    }
    if (this.view === "new-space") {
      this.error = null;
      this.busy = false;
      this.createMissing = false;
      this.folder = InputState.new({ placeholder: "A folder, e.g. ~/code/app" });
      this.folder.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      this.folder.on("submit", (_e, cx) => this.create(cx));
      this.folder.focus();
      cx.timer.after(600, () => this.folder.focus());
    }
    if (this.view === "icon" || this.view === "group") {
      const group = groups().find((g) => g.id === p.group);
      const icon = this.view === "icon" ? icons()[p.space] : group?.icon;
      this.mode = icon?.image ? "image" : icon?.emoji ? "emoji" : "default";
      this.picture = icon?.image ?? null;
      this.error = null;
      this.emoji = InputState.new({ placeholder: "Type or paste an emoji", value: icon?.emoji ?? "" });
      this.emoji.on("change", (_e, cx) => cx.notify());
      this.emoji.on("submit", () => this.save());
      if (this.view === "group") {
        this.name = InputState.new({ placeholder: "Group name", value: group?.name ?? "" });
        this.name.on("submit", () => this.save());
        this.name.focus();
        cx.timer.after(600, () => this.name.focus());
      }
    }
  }

  // [label, icon, action, line above]
  items() {
    const p = props() ?? {};
    if (this.view === "group-menu") {
      const list = groups();
      const i = list.findIndex((g) => g.id === p.group);
      return [
        ["Edit group…", chrome("square-pen"), () => openGroup({ group: p.group })],
        ...(i > 0 ? [["Move up", own("up"), () => moveGroup(p.group, -1)]] : []),
        ...(i >= 0 && i < list.length - 1 ? [["Move down", own("down"), () => moveGroup(p.group, 1)]] : []),
        ["Delete group", chrome("x"), () => removeGroup(p.group), true],
      ];
    }
    const id = p.space;
    const mine = groupOf(id);
    const worktree = (action) => () => openOverlay({ mod: "worktree", kind: "dialog", ...(action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: { space: id, action } });
    return [
      ["Rename", chrome("square-pen"), () => run("space.rename", { id })],
      ...(this.git ? [["New worktree", chrome("git-branch"), worktree("new")], ["Open worktree", chrome("git-branch"), worktree("open")]] : []),
      ...(this.git === "linked" ? [["Remove worktree", chrome("git-branch"), worktree("remove")]] : []),
      // The sidebar runs them (see sync in main.js): this menu is gone before git is done.
      ...(this.git && this.remote ? [["Pull", own("pull"), () => run(`mttnb-spaces.pull:${id}`), true], ["Push", own("push"), () => run(`mttnb-spaces.push:${id}`)]] : []),
      ["Change icon…", own("emoji"), () => openIcon(id), true],
      ...groups().filter((g) => g.id !== mine?.id).map((g, n) => [`Move to ${shownName(g.name)}`, chrome("folder"), () => moveToGroup(id, g.id), n === 0]),
      ...(mine ? [[`Remove from ${shownName(mine.name)}`, chrome("minus"), () => moveToGroup(id, null)]] : []),
      ["New group…", chrome("folder-plus"), () => openGroup({ space: id }), !groups().length],
      ["Close", chrome("x"), () => run("space.close", { id }), true],
    ];
  }

  choose(i) {
    const it = this.items()[i];
    if (!it) return;
    close();
    it[2]();
  }

  async pick(paths, cx) {
    const source = paths.find((f) => PICTURE.test(f));
    if (!source) { this.error = paths.length ? "That isn't a picture (png, jpg, gif, webp or svg)." : null; cx.notify(); return; }
    try {
      this.picture = await keepPicture(source);
      this.mode = "image";
      this.error = null;
    } catch (e) {
      this.error = `Couldn't copy it: ${e?.message ?? e}`;
    }
    cx.notify();
  }

  // The system's file picker, where there is one to ask for (macOS).
  choosePicture(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("osascript", ["-e", "activate", "-e", 'POSIX path of (choose file of type {"public.image"} with prompt "Choose a picture")']).catch(() => null);
      if (r?.code === 0 && r.stdout.trim()) await this.pick([r.stdout.trim()], cx);
    });
  }

  icon() {
    if (this.mode === "image" && this.picture) return { image: this.picture };
    const emoji = [...this.emoji.value().trim()].slice(0, 4).join("");
    return this.mode === "emoji" && emoji ? { emoji } : null;
  }

  save() {
    const p = props() ?? {};
    if (this.view === "icon") setIcon(p.space, this.icon());
    else {
      const name = this.name.value().trim() || "New group";
      if (p.group) updateGroup(p.group, { name, icon: this.icon() });
      else addGroup(name, this.icon(), p.space ?? null);
    }
    close();
  }

  create(cx) {
    const typed = this.folder.value().trim();
    if (!typed || this.busy) return;
    const machine = props()?.machine ?? null;
    const createMissing = this.createMissing;
    this.busy = true;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const folder = await resolveFolder(typed, machine, createMissing);
        run("space.new", { folder, machine: machine ?? "" });
        addRecent(machine, folder);
        close();
      } catch (e) {
        this.error = `Couldn't add ${typed}${machine ? ` on ${machine}` : ""}: ${e?.message ?? e}`;
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  // The system's folder picker (this computer only): its folder goes in the field.
  chooseFolder(cx) {
    cx.spawn(async (cx) => {
      const folder = await pickFolder({ prompt: "Choose" }).catch(() => null);
      if (!folder) return;
      this.folder.set_value(tilde(folder, null));
      this.error = null;
      this.folder.focus();
      cx.notify();
    });
  }

  render(cx) {
    if (this.view === "new-space") return this.renderNewSpace();
    return this.view === "space-menu" || this.view === "group-menu" ? this.renderMenu() : this.renderDialog(cx);
  }

  renderMenu() {
    const t = theme();
    const list = this.items();
    return v_flex().id("menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") close();
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => v_flex()
        .when(Boolean(it[3]) && i > 0, (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`mi-${i}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choose(i))
          .child(svg(it[1]).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().truncate().child(it[0])))));
  }

  renderNewSpace() {
    const t = theme();
    const machine = props()?.machine ?? null;
    const label = (text) => div().pt(14).pb(7).text_size(11.5).text_color(t.dim).child(text);
    const typed = this.folder.value().trim();
    const known = knownFolders(machine);
    return v_flex().id("mttnb-new-space").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child(machine ? `New space on ${machine}` : "New space"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(label("Folder"))
      .child(h_flex().gap(8).items_center()
        .child(field(t, this.folder).flex_1())
        // pickFolder shows this computer's folders only.
        .when(!machine, (el) => el.child(h_flex().id("choose").h(36).px(12).gap(6).flex_none().items_center().rounded(9).border_1()
          .border_color(t.input).bg(t.raised).text_size(12.5).cursor_pointer().hover((s) => s.opacity(0.88))
          .on_click((_e, cx) => this.chooseFolder(cx))
          .child(svg(chrome("folder")).size(14).text_color(t.muted)).child("Choose…"))))
      .child(Checkbox.new("create-missing-folder").checked(this.createMissing).mt(9)
        .flex().items_center().gap(7).text_size(11.5).cursor_pointer()
        .on_change((checked, cx) => { this.createMissing = checked; this.error = null; cx.notify(); })
        .child(div().size(14).flex_none().flex().items_center().justify_center().rounded(3).border_1()
          .border_color(t.input).bg(this.createMissing ? t.solid : t.background)
          .text_color(t.solid_foreground).text_size(11).child(this.createMissing ? "✓" : ""))
        .child("Create folder if missing"))
      .child(div().pt(6).text_size(11.5).text_color(this.error ? t.blocked : t.dim)
        .child(this.error ?? "Its terminals start here."))
      .child(v_flex().flex_1().min_h(0)
        .when(known.length > 0, (el) => el.child(label("Recent"))
          .child(v_flex().id("recent").flex_1().min_h(0).overflow_y_scrollbar().children(known.map((f, i) => h_flex().id(`recent-${i}`)
            .h(30).flex_none().px(8).gap(9).items_center().rounded(7).cursor_pointer()
            .when(typed === tilde(f, machine) || typed === f, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { this.folder.set_value(tilde(f, machine)); this.error = null; this.folder.focus(); cx.notify(); })
            .child(svg(chrome("folder")).size(14).flex_none().text_color(t.muted))
            .child(div().flex_1().truncate().text_size(12.5).child(tilde(f, machine))))))))
      .child(h_flex().pt(14).gap(8).justify_end()
        .child(button(t, "cancel", "Cancel", false, () => close()))
        .child(button(t, "create", this.busy ? "Adding…" : "Add space", true, (_e, cx) => this.create(cx))
          .when(!typed, (el) => el.opacity(0.5))));
  }

  renderDialog(cx) {
    const t = theme();
    const p = props() ?? {};
    const space = spaces().find((s) => s.id === p.space);
    const group = groups().find((g) => g.id === p.group);
    const title = this.view === "icon" ? `Icon for ${shownName(space?.name) ?? "space"}` : group ? "Edit group" : "New group";
    const label = (text) => div().pt(14).pb(7).text_size(11.5).text_color(t.dim).child(text);
    const tab = (mode, text) => h_flex().id(`mode-${mode}`).flex_1().h(28).items_center().justify_center().rounded(6)
      .text_size(12).cursor_pointer()
      .bg(this.mode === mode ? t.raised : t.background).text_color(this.mode === mode ? t.foreground : t.muted)
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { this.mode = mode; if (mode === "emoji") this.emoji.focus(); cx.notify(); })
      .child(text);
    // What it looks like with no icon of its own.
    const plain = this.view === "icon"
      ? identicon(p.space, 40, fillOf(t, (shared("space.colors") ?? {})[p.space]))
      : svg(chrome("folder")).size(30).text_color(t.muted);
    const preview = h_flex().size(56).flex_none().rounded(12).bg(t.background).border_1().border_color(t.border)
      .items_center().justify_center().child(iconTile(this.icon(), 40, plain));
    const mac = window()?.platform === "macos";

    return v_flex().id("mttnb-edit").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child(title))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .when(this.view === "group", (el) => el.child(label("Name")).child(field(t, this.name)))
      .child(label("Icon"))
      .child(h_flex().gap(14).items_center()
        .child(preview)
        .child(h_flex().flex_1().p(3).gap(3).rounded(8).bg(t.background).border_1().border_color(t.border)
          .child(tab("default", this.view === "icon" ? "Identicon" : "Folder"))
          .child(tab("emoji", "Emoji"))
          .child(tab("image", "Picture"))))
      .child(v_flex().flex_1().min_h(0).pt(12).gap(8)
        .when(this.mode === "default", (el) => el.child(div().text_size(11.5).text_color(t.dim)
          .child(this.view === "icon" ? "A pattern of its own, on the space's colour." : "A folder.")))
        .when(this.mode === "emoji", (el) => el.child(field(t, this.emoji))
          .child(div().flex().flex_wrap().gap(4).children(EMOJI.map((e, i) => h_flex().id(`emoji-${i}`).size(34).items_center()
            .justify_center().rounded(7).text_size(18).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { this.emoji.set_value(e); cx.notify(); })
            .child(e)))))
        .when(this.mode === "image", (el) => el
          .child(v_flex().id("drop").h(96).gap(8).items_center().justify_center().rounded(10)
            .border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.dim)
            .on_drop((e, cx) => cx.spawn(async (cx) => this.pick(e.paths ?? [], cx)))
            .child(this.picture ? image(this.picture).size(40).rounded(9) : svg(chrome("files")).size(22))
            .child(mac ? "Drop a picture here, or" : "Drop a picture here")
            .when(mac, (el) => el.child(h_flex().id("choose").h(26).px(10).items_center().rounded(7).border_1()
              .border_color(t.input).bg(t.raised).text_color(t.foreground).cursor_pointer().hover((s) => s.opacity(0.88))
              .on_click((_e, cx) => this.choosePicture(cx)).child("Choose…"))))
          .child(div().text_size(11).text_color(t.dim).child("PNG, JPG, GIF, WebP or SVG; square works best.")))
        .when(Boolean(this.error), (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(this.error))))
      .child(h_flex().pt(14).gap(8).justify_end()
        .child(button(t, "cancel", "Cancel", false, () => close()))
        .child(button(t, "save", "Save", true, () => this.save())));
  }
}
