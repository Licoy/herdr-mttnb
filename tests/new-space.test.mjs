import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, chmod, access, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const source = (await readFile(new URL("../mods/mttnb-spaces/edit.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "").replace(/export /g, "");

function load(overrides = {}) {
  const events = [];
  const nodes = [];
  const element = () => {
    const values = {};
    const node = new Proxy(values, { get: (target, key) => (...args) => {
      if (key === "when") { if (args[0]) args[1](node); }
      else target[key] = args;
      return node;
    } });
    nodes.push(values);
    return node;
  };
  const context = vm.createContext({
    props: () => ({ view: "new-space", machine: null }),
    InputState: { new: () => ({ text: "", value() { return this.text; }, set_value(text) { this.text = text; }, on() {}, focus() {} }) },
    Checkbox: { new: element }, Input: { new: element }, div: element, v_flex: element, h_flex: element, svg: element,
    theme: () => ({}), home: () => tmpdir(), shared: () => null, spaces: () => [], recentFolders: () => [],
    exec: async (command, args, options) => {
      events.push(["exec", options]);
      try {
        const r = await execFileAsync(command, args);
        return { ...r, code: 0 };
      } catch (e) {
        if (typeof e.code !== "number") throw e;
        return { code: e.code, stdout: e.stdout, stderr: e.stderr };
      }
    },
    addRecent: (...args) => events.push(["recent", ...args]), closeOverlay: () => events.push(["close"]),
    run: (...args) => events.push(["run", ...args]), ...overrides,
  });
  vm.runInContext(`${source}\nglobalThis.Editor = Editor; globalThis.resolveFolder = resolveFolder;`, context);
  const cx = { focus_handle: () => ({ focus() {} }), timer: { after() {} }, notify() {}, spawn(fn) { this.pending = fn(this); } };
  const editor = new context.Editor(cx);
  return { context, editor, cx, events, nodes };
}

async function temporary(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "new-space-"));
  try { await fn(await realpath(root)); } finally { await rm(root, { recursive: true, force: true }); }
}

async function create(state, folder) {
  state.editor.folder.set_value(folder);
  state.editor.create(state.cx);
  await state.cx.pending;
  assert.equal(state.editor.busy, false);
  assert.equal(state.editor.folder.value(), folder);
}

test("checkbox starts unchecked and its change handler enables creation", async () => temporary(async (root) => {
  const state = load();
  state.editor.renderNewSpace();
  const checkbox = state.nodes.find((n) => n.checked);
  assert.equal(checkbox.checked[0], false);
  checkbox.on_change[0](true, state.cx);
  await create(state, path.join(root, "nested", "project"));
  assert.equal(state.editor.error, null);
  assert.equal(state.events.find((e) => e[0] === "run")[2].folder, path.join(root, "nested", "project"));
  await access(path.join(root, "nested", "project"));
  checkbox.on_change[0](false, state.cx);
  const absent = path.join(root, "cancelled");
  await create(state, absent);
  assert.match(state.editor.error, /cancelled/);
  await assert.rejects(access(absent), { code: "ENOENT" });
  assert.equal(state.events.filter((e) => e[0] === "run").length, 1);
}));

test("missing folder stays missing without consent", async () => temporary(async (root) => {
  const state = load();
  const folder = path.join(root, "absent");
  await create(state, folder);
  assert.match(state.editor.error, /absent/);
  assert.equal(state.events.some((e) => e[0] === "run" || e[0] === "close" || e[0] === "recent"), false);
  await assert.rejects(access(folder), { code: "ENOENT" });
}));

test("existing folder opens with either checkbox value", async () => temporary(async (root) => {
  for (const checked of [false, true]) {
    const state = load();
    state.editor.createMissing = checked;
    await create(state, root);
    assert.equal(state.editor.error, null);
    assert.equal(state.events.find((e) => e[0] === "run")[2].folder, root);
  }
}));

test("file paths display errors and never open a space", async () => temporary(async (root) => {
  const file = path.join(root, "file");
  await writeFile(file, "content");
  for (const checked of [false, true]) {
    const state = load();
    state.editor.createMissing = checked;
    await create(state, file);
    assert.match(state.editor.error, /file/);
    assert.equal(state.events.some((e) => e[0] === "run" || e[0] === "close"), false);
  }
}));

test("permission failures retain input and recover busy", async () => temporary(async (root) => {
  const locked = path.join(root, "locked");
  await mkdir(locked, { mode: 0o000 });
  try {
    for (const checked of [false, true]) {
      const state = load();
      state.editor.createMissing = checked;
      await create(state, checked ? path.join(locked, "child") : locked);
      assert.match(state.editor.error, /[Pp]ermission denied/);
      assert.equal(state.events.some((e) => e[0] === "run" || e[0] === "close"), false);
    }
  } finally { await chmod(locked, 0o700); }
}));

test("exec rejection is visible and remote machine is preserved", async () => {
  const state = load({ props: () => ({ view: "new-space", machine: "remote" }), exec: async (_cmd, _args, options) => {
    assert.equal(options.on, "remote");
    throw new Error("machine unreachable");
  } });
  await create(state, "~/project");
  assert.match(state.editor.error, /machine unreachable/);
  assert.equal(state.events.length, 0);
});

test("busy prevents duplicate submission and recovers after failure", async () => {
  let reject;
  let calls = 0;
  const state = load({ exec: () => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); } });
  state.editor.folder.set_value("~/project");
  state.editor.create(state.cx);
  state.editor.create(state.cx);
  assert.equal(state.editor.busy, true);
  assert.equal(calls, 1);
  reject(new Error("exec failed"));
  await state.cx.pending;
  assert.equal(state.editor.busy, false);
  assert.equal(state.editor.folder.value(), "~/project");
  assert.match(state.editor.error, /exec failed/);
});

test("space command failure keeps the dialog open and input intact", async () => temporary(async (root) => {
  const state = load({ run: () => { throw new Error("space command failed"); } });
  await create(state, root);
  assert.match(state.editor.error, /space command failed/);
  assert.equal(state.events.some((e) => e[0] === "close" || e[0] === "recent"), false);
}));

test("spaces and shell metacharacters are passed literally", async () => temporary(async (root) => {
  const state = load();
  state.editor.createMissing = true;
  const folder = path.join(root, "quote ' space $(touch INJECTED) ; & `whoami`", "project");
  await create(state, folder);
  await access(folder);
  assert.equal(state.editor.error, null);
  assert.equal(state.events.find((e) => e[0] === "run")[2].folder, folder);
}));

test("home and relative paths use the target shell's HOME", async () => temporary(async (root) => {
  const state = load({ exec: async (command, args) => {
    const r = await execFileAsync(command, args, { env: { ...process.env, HOME: root } });
    return { ...r, code: 0 };
  } });
  assert.equal(await state.context.resolveFolder("~/tilde", null, true), path.join(root, "tilde"));
  assert.equal(await state.context.resolveFolder("relative", null, true), path.join(root, "relative"));
}));
