// What mttnb adds to spaces, kept in shared state (saved with Herdr's, seen by every copy):
// each space's own icon, and groups of spaces.

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, setShared } from "herdr";

const ICONS = "mttnb.space.icons";   // { space id: { emoji } | { image } }; none: its identicon
const GROUPS = "mttnb.space.groups"; // [{ id, name, icon, folded, spaces: [space id] }], in order

export const icons = () => shared(ICONS) ?? {};
export const groups = () => shared(GROUPS) ?? [];
export const groupOf = (spaceId) => groups().find((g) => g.spaces.includes(spaceId)) ?? null;

export function setIcon(spaceId, icon) {
  const all = { ...icons() };
  if (icon) all[spaceId] = icon;
  else delete all[spaceId];
  setShared(ICONS, all);
}

export function updateGroup(id, change) {
  setShared(GROUPS, groups().map((g) => (g.id === id ? { ...g, ...change } : g)));
}

// Puts a space in a group (at its end), out of any other; groupId null: in none.
export function moveToGroup(spaceId, groupId) {
  setShared(GROUPS, groups().map((g) => {
    const rest = g.spaces.filter((s) => s !== spaceId);
    return { ...g, spaces: g.id === groupId ? [...rest, spaceId] : rest };
  }));
}

// A new group, last; with `spaceId`, that space moves into it.
export function addGroup(name, icon, spaceId) {
  const id = `g${Date.now().toString(36)}`;
  const rest = groups().map((g) => ({ ...g, spaces: g.spaces.filter((s) => s !== spaceId) }));
  setShared(GROUPS, [...rest, { id, name, icon, folded: false, spaces: spaceId ? [spaceId] : [] }]);
  return id;
}

// Its spaces go back to the ungrouped list.
export function removeGroup(id) {
  setShared(GROUPS, groups().filter((g) => g.id !== id));
}

export function moveGroup(id, by) {
  const list = [...groups()];
  const i = list.findIndex((g) => g.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  setShared(GROUPS, list);
}

// An icon: a picture, an emoji, else `fallback` (the element to draw without one).
export function iconTile(icon, size, fallback) {
  if (icon?.image) return image(icon.image).size(size).flex_none().rounded(Math.round(size * 0.28));
  if (icon?.emoji) {
    return h_flex().size(size).flex_none().items_center().justify_center()
      .child(div().text_size(Math.round(size * 0.78)).child(icon.emoji));
  }
  return fallback;
}

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
export const fillOf = (t, color = "ansi6") => (color.startsWith("#") ? color : (MARK[color] ?? t[color]));

// A space's own pattern (a 5x5 identicon, mirrored like GitHub's) in white on its
// colour: the same space always gets the same one, from its id.
export function identicon(seed, size, fill) {
  let h = 2166136261; // FNV-1a
  for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  let bits = h & 0x7fff; // 3 columns x 5 rows; the last two columns mirror the first two
  if (bits === 0 || bits === 0x7fff) bits ^= 0x5a5a;
  const cell = size * 0.14;
  const on = (x, y) => (bits >> (Math.min(x, 4 - x) * 5 + y)) & 1;
  return v_flex().size(size).flex_none().rounded(Math.round(size * 0.28)).bg(fill).items_center().justify_center()
    .child(v_flex().children([0, 1, 2, 3, 4].map((y) => h_flex().children([0, 1, 2, 3, 4].map((x) =>
      div().size(cell).when(Boolean(on(x, y)), (el) => el.bg("#ffffff")))))));
}
