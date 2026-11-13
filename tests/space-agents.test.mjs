import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../mods/mttnb-spaces/main.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export default class", "class");

function element(kind = "div") {
  const data = { kind, nodes: [], attrs: {} };
  const node = new Proxy(data, { get: (target, key) => key in target ? target[key] : (...args) => {
    if (key === "when") { if (args[0]) args[1](node); }
    else if (key === "child") data.nodes.push(args[0]);
    else if (key === "children") data.nodes.push(...args[0]);
    else data.attrs[key] = args;
    return node;
  } });
  return node;
}

function load(list = [], all = []) {
  return vm.runInNewContext(`${source}\n;({ agentStatuses, agentBadge, Spaces })`, {
    View: class {}, agents: () => list, terminals: () => all,
    div: () => element(), h_flex: () => element(), v_flex: () => element(), svg: element,
    shared: () => null, icons: () => ({}), fillOf: () => "avatar",
    identicon: () => element("identicon"), iconTile: (_icon, _size, fallback) => fallback,
    shownName: name => name,
  });
}

const terminal = (address, status, extra = {}) => ({ address, status, state: "live", ...extra });
const desk = (address, space, status, extra = {}) => terminal(address, status, {
  labels: { "mttnb.role": "desk", "mttnb.space": space }, ...extra,
});
const plain = value => JSON.parse(JSON.stringify(value));
const flatten = node => typeof node === "string" ? [node] : [node, ...node.nodes.flatMap(flatten)];

test("counts live agents by space, including desks and descendants, without duplicates", () => {
  const list = [
    { address: "pane", space: "a", status: "working" },
    { address: "desk", space: "a", status: "idle" },
    { address: "remote/pane", space: "remote/a", status: "blocked" },
  ];
  const all = [
    terminal("grandchild", "working", { parent: "child" }),
    terminal("child", "working", { parent: "pane" }),
    terminal("pane", "idle"), // the UI's status wins over a raw core status
    desk("desk", "a", "working"),
    desk("second", "a", "working"),
    desk("other", "b", "error"),
    desk("ended", "a", "working", { state: "exited" }),
    terminal("ended-child", "working", { parent: "pane", state: "exited" }),
    terminal("shell", null, { parent: "pane" }),
    terminal("unrelated", "working"),
  ];
  const mod = load(list, all);
  const states = plain(mod.agentStatuses());
  assert.deepEqual(states, {
    a: ["working", "idle", "working", "working", "working"],
    b: ["blocked"], "remote/a": ["blocked"],
  });
  assert.equal(mod.agentBadge(states.a).count, 4);

  // A child gaining its own pane must still be counted once, in its actual space.
  list.push({ address: "child", space: "b", status: "working" });
  const moved = plain(mod.agentStatuses());
  assert.equal(mod.agentBadge(moved.a).count, 2);
  assert.equal(moved.b.filter(status => status === "working").length, 2);
});

test("badge follows needs-you, working, idle priority and counts only that category", () => {
  const { agentBadge } = load();
  assert.equal(agentBadge([]), null);
  assert.equal(agentBadge([null, "unknown"]), null);
  assert.deepEqual(plain(agentBadge(["working", "idle", "working", "done"])), {
    status: "working", count: 2, counts: { blocked: 0, working: 2, idle: 2 },
  });
  assert.deepEqual(plain(agentBadge(["working", "blocked", "blocked", "idle"])), {
    status: "blocked", count: 2, counts: { blocked: 2, working: 1, idle: 1 },
  });
  assert.equal(agentBadge(["idle", "done"]).count, 2);
  assert.equal(agentBadge(["idle", "done"]).status, "idle");
});

test("each state transition updates the badge; only the working ring rotates", () => {
  const agent = { address: "pane", space: "a", status: "working" };
  const { Spaces, agentStatuses } = load([agent]);
  const view = Object.create(Spaces.prototype);
  const theme = { ansi2: "green", ansi3: "yellow", ansi4: "blue", chrome: "background" };
  for (const [status, color] of [["working", "green"], ["blocked", "yellow"], ["idle", "blue"], ["done", "blue"]]) {
    agent.status = status;
    view.agentStates = agentStatuses();
    const nodes = flatten(view.spaceIcon({ id: "a" }, theme));
    const badge = nodes.find(n => n.attrs?.id?.[0] === "space-agents-a");
    assert.equal(badge.attrs.text_color[0], color);
    assert.ok(nodes.includes("1"));
    assert.equal(nodes.filter(n => n.attrs?.spin).length, status === "working" ? 1 : 0);
    assert.ok(nodes.every(n => !n.attrs?.loop));
    assert.ok(nodes.filter(n => n.attrs?.spin).every(n => !flatten(n).includes("1")), "the number stays still");
  }
  view.agentStates = {};
  assert.ok(flatten(view.spaceIcon({ id: "a" }, theme)).every(n => !n.attrs?.id));
});

test("normal rows, grouped worktrees and the narrow rail show the same project count", () => {
  const { Spaces } = load();
  const view = Object.assign(Object.create(Spaces.prototype), {
    agentStates: { a: Array(12).fill("working") }, syncing: {}, pressed: null,
  });
  const row = { w: { id: "a", name: "project" }, i: 0, g: null, tree: null };
  for (const render of [
    () => view.row(row, {}, null),
    () => view.row({ ...row, tree: "└─" }, {}, "group", "last"),
    () => view.compact(row, {}),
  ]) {
    const nodes = flatten(render());
    assert.equal(nodes.filter(n => n.attrs?.id?.[0] === "space-agents-a").length, 1);
    assert.ok(nodes.includes("12"));
    assert.equal(nodes.filter(n => n.attrs?.spin).length, 1);
  }
});
