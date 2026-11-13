import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';

function load(file, bindings, names) {
  const code = readFileSync(new URL(`../mods/${file}/main.js`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from "[^"]+";\n/gm, '')
    .replace(/export default class /g, 'class ')
    .replace(/export function /g, 'function ');
  return vm.runInNewContext(`${code}\n;({${names.join(',')}})`, { View: class {}, ...bindings });
}

function fixture(program = { shell: true }, cached) {
  const space = { id: 'space', folder: '/project', tabs: [{ id: 'tab' }, { id: 'other' }] };
  const ps = [{ pane: 'pane', terminal: 't1', tab: 'tab', program, cwd: '/foreground' }];
  const state = { 'mttnb-spaces.shells': cached ? { pane: cached } : {} };
  const calls = [];
  let root = '/project';
  const bindings = {
    panes: () => ps, spaces: () => [space], home: () => '/home',
    shared: key => state[key], setShared: (key, value) => { state[key] = value; },
    notify: value => calls.push(['notify', value]),
    exec: async (command, args) => {
      calls.push([command, args]);
      if (command === 'hc') return { code: 0, stdout: JSON.stringify(args[0] === 'get' ? { pid: 123 } : { address: 'desk' }) };
      if (args[1] === 'printf %s "$SHELL"') return { code: 0, stdout: '/bin/zsh' };
      return { code: 0, stdout: root };
    },
    hc: async args => bindings.exec('hc', args),
  };
  return { space, ps, state, calls, bindings, setRoot: value => { root = value; } };
}

test('new desk ignores foreground child shell cwd with a cold cache', async () => {
  const f = fixture();
  const desk = load('mttnb-desk', f.bindings, ['startDesk', 'folderOf']);
  await desk.startDesk({ space: f.space, tab: f.space.tabs[0] }, { installed: true, key: 'test', name: 'Test', run: ['test-agent'] });
  const run = f.calls.find(([command, args]) => command === 'hc' && args[0] === 'run')[1];
  assert.equal(run[run.indexOf('--cwd') + 1], '/project');
});

for (const program of [{ agent: true }, { shell: true }, {}]) {
  test(`launch refreshes polluted cache for ${JSON.stringify(program)}`, async () => {
    const f = fixture(program, '/polluted');
    const desk = load('mttnb-desk', f.bindings, ['startDesk', 'folderOf']);
    const place = { space: f.space, tab: f.space.tabs[0] };
    await desk.startDesk(place, { installed: true, key: 'test', name: 'Test', run: ['test-agent'] });
    const run = f.calls.find(([command, args]) => command === 'hc' && args[0] === 'run')[1];
    assert.equal(run[run.indexOf('--cwd') + 1], '/project');
    assert.equal(desk.folderOf(place), '/project');
  });
}

test('tabs without a resolved terminal use their own space folder', () => {
  const f = fixture();
  f.state['mttnb-spaces.places'] = { space: JSON.stringify([null, '/other-tab']) };
  f.state['mttnb-spaces.shells'] = { pane: '/first-tab' };
  const desk = load('mttnb-desk', f.bindings, ['folderOf']);
  assert.equal(desk.folderOf({ space: f.space, tab: f.space.tabs[1] }), '/project');
  assert.equal(desk.folderOf({ space: f.space, tab: f.space.tabs[0] }), '/first-tab');
});

function spacesFixture(f) {
  const mod = load('mttnb-spaces', { ...f.bindings, machines: () => [], window: () => ({ active: false }), console }, ['Spaces', 'folder', 'CWD_OF']);
  const view = Object.assign(Object.create(mod.Spaces.prototype), {
    asked: new Map(), git: {}, at: {}, shells: {}, busy: {}, ready: {},
  });
  const pending = [];
  const cx = { spawn: task => pending.push(task(cx)), notify() {} };
  return { ...mod, view, async poll() {
    view.askShells([f.space], f.ps, cx);
    await Promise.all(pending.splice(0));
    view.due(Date.now(), [f.space], f.ps);
  } };
}

test('spaces query cold child shells and agents, then follow normal shell cd', async () => {
  for (const program of [{ shell: true }, { agent: true }]) {
    const f = fixture(program);
    const s = spacesFixture(f);
    await s.poll();
    assert.equal(f.state['mttnb-spaces.shells'].pane, '/project');
    f.ps[0] = { ...f.ps[0], cwd: '/next', program: { shell: true } };
    f.setRoot('/next');
    await s.poll();
    assert.equal(f.state['mttnb-spaces.shells'].pane, '/next');
    f.ps[0] = { ...f.ps[0], cwd: '/foreground', program: { shell: true, name: 'child-shell' } };
    await s.poll();
    assert.equal(f.state['mttnb-spaces.shells'].pane, '/next');
    assert.equal(JSON.parse(f.state['mttnb-spaces.places'].space)[1], '/next');
  }
});

test('root cwd read errors prevent launching an agent and remain visible', async () => {
  const f = fixture();
  const original = f.bindings.exec;
  f.bindings.exec = async (command, args) => command === 'sh' ? { code: 1, stdout: '', stderr: 'cwd read denied' } : original(command, args);
  const desk = load('mttnb-desk', f.bindings, ['startDesk']);
  await desk.startDesk({ space: f.space, tab: f.space.tabs[0] }, { installed: true, key: 'test', name: 'Test', run: ['test-agent'] });
  assert.equal(f.calls.some(([command, args]) => command === 'hc' && args[0] === 'run'), false);
  assert.match(f.calls.find(([command]) => command === 'notify')[1].body, /cwd read denied/);
});

test('header shows the same root folder used by launch', async () => {
  const f = fixture();
  const values = [];
  const element = new Proxy({}, { get: (_target, key) => (...args) => {
    if (key === 'when') { if (args[0]) args[1](element); }
    if (key === 'child' && typeof args[0] === 'string') values.push(args[0]);
    return element;
  } });
  const desk = load('mttnb-desk', { ...f.bindings, div: () => element, svg: () => element, h_flex: () => element,
    theme: () => ({}), focused: () => ({ space: 'space', tab: 'tab' }),
  }, ['startDesk', 'MttnbDesk']);
  await desk.startDesk({ space: f.space, tab: f.space.tabs[0] }, { installed: true, key: 'test', name: 'Test', run: ['test-agent'] });
  const header = Object.assign(Object.create(desk.MttnbDesk.prototype), { sync: () => ({ desks: [], desk: null }) });
  header.renderHeader({});
  assert.ok(values.includes('/project'));
  assert.ok(!values.includes('/foreground'));
});

test('late sidebar reads cannot overwrite a newer desk root read', async () => {
  const f = fixture();
  let resolve;
  let deferred = false;
  const original = f.bindings.exec;
  f.bindings.exec = async (...args) => deferred && args[0] === 'sh' ? new Promise(done => { resolve = done; }) : original(...args);
  const s = spacesFixture(f);
  await s.poll();
  deferred = true;
  f.ps[0] = { ...f.ps[0], cwd: '/changed' };
  const pending = s.poll();
  await setImmediate();
  f.state['mttnb-spaces.shells'] = { pane: '/newer-root' };
  resolve({ code: 0, stdout: '/older-root' });
  await pending;
  assert.equal(f.state['mttnb-spaces.shells'].pane, '/newer-root');
  await s.poll();
  assert.equal(f.state['mttnb-spaces.shells'].pane, '/newer-root');
});

test('a result from an older foreground signature cannot overwrite the current one', async () => {
  const f = fixture();
  const waiting = [];
  const original = f.bindings.exec;
  f.bindings.exec = async (...args) => args[0] === 'sh' ? new Promise(resolve => waiting.push(resolve)) : original(...args);
  const s = spacesFixture(f);
  const first = s.poll();
  await setImmediate();
  f.ps[0] = { ...f.ps[0], cwd: '/changed' };
  const second = s.poll();
  await setImmediate();
  waiting[1]({ code: 0, stdout: '/current-root' });
  await second;
  waiting[0]({ code: 0, stdout: '/obsolete-root' });
  await first;
  assert.equal(f.state['mttnb-spaces.shells'].pane, '/current-root');
});

test('spaces report lookup failure once per observed state without retrying', async () => {
  const f = fixture();
  let reads = 0;
  f.bindings.hc = async () => { reads++; throw new Error('offline'); };
  const s = spacesFixture(f);
  await s.poll();
  await s.poll();
  assert.equal(reads, 1);
});
