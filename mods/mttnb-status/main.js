// mttnb's copy of Herdr's workspace-status mod (mod.clone): the agent count takes in the
// Coding column's agents (mttnb-desk), which have no pane, so agents() leaves them out,
// and says how many are working besides how many need you.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, terminals, theme, run, window, keys } from "herdr";

// Every agent's status: agents() and the desks it doesn't list (an error counts as blocked).
function statuses() {
  const list = agents();
  const listed = new Set(list.map((a) => a.address));
  const desks = terminals().filter((k) => k.state === "live" && k.labels?.["mttnb.role"] === "desk" && !listed.has(k.address));
  return [...list.map((a) => a.status), ...desks.map((k) => (k.status === "error" ? "blocked" : k.status))];
}

export default class MttnbStatus extends View {
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = statuses();
    const needs = list.filter(s => s === "blocked").length;
    const working = list.filter(s => s === "working").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(working ? t.working : t.dim))
        .child(`${list.length} ${list.length === 1 ? "agent" : "agents"}`)
        .when(working > 0, el => el.child(div().text_color(t.working).child(`· ${working} working`)))
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
