# mttnb

Herdr's own window with a coding desk built in: the sidebar lists spaces (with their git state, in folding groups, each with its own icon if you like) and agents, and the work area is split into three cards. On the left a fixed Coding column holds the shown tab's agents: with none it lists every agent Herdr knows, and a click starts one. In the middle are the tab's terminals as usual. On the right a Files / Changes / Graph panel opens from the tab bar. The colours follow the system appearance: Atom One Dark's in dark mode (blue `#61afef` on `#282c34`, panels `#21252b`), Atom One Light's in light mode (blue `#4078f2` on `#fafafa`, panels `#eaeaeb`).

![mttnb](preview.png)

## What you see

Left to right, at zoom 1:

- **Sidebar**, 248px wide (44–480), on `chrome`, no system title bar (macOS traffic lights at 12, 16):
  - top 46px: Herdr's brand row with search and fold buttons (drags the window);
  - Spaces list and Agents list, sharing the height equally (each at least 90px). The Agents list also shows the Coding column's agents;
  - the Spaces list: a 31px title row ("Spaces" in 11.5px `dim`, a 26px folder-plus button for a new group, a 26px `+` for a new space); then the groups in order, each a 30px header (11px chevron, 16px icon: a `muted` folder, an emoji or a picture; the name in `foreground` medium; the count of its spaces in 11px `dim`; folded, after the name its spaces' most urgent agent, a `working` spinner or a `blocked` / `done` 6px dot, and at the right their summed `●n` `↑n` `↓n`) with its spaces under it unless folded, 20px in, hanging off a 1px `dim` line (at 45% opacity) under the chevron (13px in) that branches to each space at its middle and ends at the last one in a radius-5 corner; 6px between groups; then a 1px `border` divider and the spaces in no group. A space row is 30px (28px for a worktree under its repo): an 18px icon (its identicon, a mirrored 5×5 white pattern from its id on its colour, radius-5 tile; an emoji; or a picture with radius 5), the name in 13px `foreground` (at most 118px, 100px in a group), while a Pull / Push runs a 12px down / up arrow in `working` pulsing in opacity, then at the right in 11.5px: the branch in `dim` (a short commit when detached), `●n` uncommitted changes in `blocked`, `↑n` to push in `ansi2`, `↓n` to pull in `ansi1`, each only when not zero. The shown space is on `selected`, rows radius 8;
  - bottom 69px: Settings and Add machine.
- A 1px `border` divider.
- **Work column** on `canvas`:
  - top 42px: the tab bar (drags the window): tabs as pills with a `+` menu; on the right `+`, then Files, Changes and Graph buttons (Graph only when the git-graph mod is installed); the open panel's button is highlighted;
  - the body, 8px padding and 8px gaps, three cards side by side:
    - **Coding column**, weight 1 (at least 360px), on `background`, radius 10, 1px `border` (the accent when it has the keyboard):
      - a 34px header on `chrome`, 12.5px text. With no agent: a 14px accent code icon, "Coding" and the tab's folder in `dim` (shortened: `~` for home, `/tmp` for `/private/tmp`, middle folders folded into `…` past 40 characters; the whole path as a tooltip). With agents: one 26px tab per agent (program icon, name, a `working` spinner or a `blocked` / `done` 6px dot; the shown one on `raised` with a `border` outline), "Claude Code 2" for the same program twice; then a 24px `+` (on `selected` while the picker shows) and an "End" button at 11.5px;
      - below it, the shown agent's terminal (6px padding), or the **picker**: a 20px accent code icon and a 15px title ("Pick an agent to start coding", or "Start another agent" when the tab already has some), an 11.5px line on where it starts; then "Installed · n" with one 46px row per installed agent (26px program tile, name in 13px semibold, its command in 11px `dim`, its 1–9 key on the right; `surface` with a `border` outline, `selected` with an accent outline on hover), then "Not installed · n", folded to one 26px line (11px chevron, up to 8 of their 16px icons at half opacity) until clicked, then the rest at half opacity marked "Not installed" (open by itself when nothing is installed; open or folded stays as left); a 30px footer of key hints in 11px `dim`;
    - **the tab's panes**, weight 1 (at least 280px): Herdr's pane cards on `background`, radius 10, 1px `border`, accent border on the focused one, 30px `pane` header on top, 8px gaps;
    - **panel**, 380px (280–900), hidden at start: a stack of Files, Changes and Graph;
  - bottom 28px: status bar (machine, branch, agent count with the Coding column's agents, its dot `working` while any works, "· n working" in `working`, "· n needs you" in `blocked`, command palette hint).
- Terminals: padding 14 × 12.

Colours (`themes/mttnb-dark.json` / `themes/mttnb-light.json`):

| token | dark | light |
| --- | --- | --- |
| background | `#282c34` | `#fafafa` |
| canvas | `#1e2227` | `#e6e6e7` |
| chrome | `#21252b` | `#eaeaeb` |
| surface | `#282c34` | `#fafafa` |
| popover / raised | `#2c313a` / `#333842` | `#ffffff` / `#dfdfe0` |
| foreground / muted / dim | `#abb2bf` / `#828997` / `#5c6370` | `#383a42` / `#696c77` / `#a0a1a7` |
| accent | `#61afef` on `#1e2227` (solid `#4d78cc` on `#ffffff`) | `#4078f2` on `#ffffff` (solid `#526fff` on `#ffffff`) |
| border | `#181a1f` | `#d4d4d6` |
| selected | `#3a3f4b` | `#d8d8da` |
| working / blocked / done / idle | `#61afef` / `#d19a66` / `#98c379` / `#4b5263` | `#4078f2` / `#c18401` / `#50a14f` / `#b4b5ba` |

The ANSI palettes are in the theme files.

## How it behaves

- **Agents per tab.** Each tab has its own Coding column. A new tab shows the picker; switching tabs switches the column to that tab's agents and the one it last showed.
- **Starting one.** Clicking an installed agent in the picker (or pressing 1–9 while it has the keyboard) starts it in the tab's first terminal's folder (else the space's), adds it as a tab in the header and shows it with the keyboard in it. Not-installed agents do nothing. In a space on another machine the rows are dimmed and the picker says it only works on this computer.
- **Several agents.** `+` in the header (or Ctrl+Alt+N) shows the picker again; the running agents keep running. A header tab shows its agent; Ctrl+Alt+Up / Down go to the previous / next.
- **Ending one.** "End" turns into "Click again to end" in the `blocked` colour for 3 seconds; a second click ends the shown agent and the column shows the next one, or the picker when none are left.
- **Statuses.** A working agent's header tab has a spinning `working` spinner; blocked and done show a 6px dot in their colour; idle shows nothing. Herdr's own alerts skip the column's agents (they have no pane), so the column alerts for them: when one turns blocked or done, it plays Herdr's `blocked` / `done` sound (unless sounds are off in Settings > Alerts) and, on macOS, posts a system notification (Herdr's `notify` only draws a toast in the window), both even while the person is looking at it (the window in front with that agent shown), and, unless they're looking, posts a toast that shows that agent when clicked; an agent first seen after a reload doesn't alert. The sidebar's Agents list groups the column's agents with the rest, by status; clicking one there shows its tab and its agent.
- **Lifetime.** Closing panes, splits or terminals on the right never touches the column's agents. Closing a tab ends its agents; closing a space ends the agents of all its tabs.
- **Keyboard between column and panes.** Ctrl+Alt+Left from the leftmost pane goes into the column (the agent, or the picker); Ctrl+Alt+Right from the column goes back to the pane the tab was last in. Ctrl+Shift+A goes to the shown agent (from the picker, back to the one shown before it), or the picker when the tab has none.
- **Space git.** Read with `git status --porcelain=v2 --branch` where the space's first terminal is (its shell's folder, kept while a program runs in front of it, which may be elsewhere, e.g. a script that cd's to a temp folder; a program already in front when the mod starts has its shell's folder read from the shell process with `lsof -d cwd`, `/proc/<pid>/cwd` on Linux, on this computer; a failed look keeps what it showed): again when a command or an agent's turn ends there, when the repo's `.git` changes, after a discard in Changes, and every minute while the window is in front.
- **Space icons.** Right-click a space: Herdr's own items (Rename, New / Open / Remove worktree, Close), Pull and Push (only in a git repo with a remote: Pull is `git pull --ff-only`, Push is `git push`, or `git push -u origin HEAD` for a branch with no upstream; the sidebar runs them, not the menu, and a toast says how it went), then Change icon…, Move to <group> for each other group, Remove from <group>, New group… (the space goes in it). Change icon… opens a 420px dialog: a 56px preview and Identicon / Emoji / Picture. Emoji: a text field and 24 emoji to click. Picture: a drop zone (and on macOS a Choose… button, the system's file picker); the picture is copied into the Herdr home under a new name. Save applies it; Esc or Cancel leaves it.
- **Groups.** The folder-plus button opens the group dialog: a name and an icon (Folder / Emoji / Picture). A click on a group's header folds or unfolds it; a folded group holding the shown space shows on `selected`. Dragging a space shows an accent outline on the group header under it; dropping it there puts it in that group, dropping it on another space moves it there and into that space's group (or out of any). Right-click a group: Edit group…, Move up, Move down, Delete group (its spaces go back to the list). The narrow rail (under 160px) lists every space flat.
- **Panel.** Files, Changes and Graph (or Ctrl+Shift+F, Ctrl+Shift+G, Cmd+G) open that panel on the right; the same button again closes it; another button switches it. Its width and whether it is open stay as left.
- **Discarding changes.** In Changes, a hovered file row shows a 20px undo-arrow button before its counts, and the header shows Discard all (undo arrow and text, 11px `dim`) before `+n −n` while there are files. A first click arms it for 3 seconds: it reads "Click again to discard" in `blocked`; a second click discards that file (or every listed file) and the list refreshes. Tracked files go back to HEAD in the index and on disk (a file added since HEAD is removed); untracked files are deleted; before the first commit, added files are removed from the index and the disk. A failure shows under the diff in `ansi1`.

## Built from

- **Layout `layouts/mttnb.json`**, cloned from `main` 0.1.11: root row `sidebar` (column: `brand` `workspace-chrome`, `sidebar-lists` with `spaces` and `agents` (mod `mttnb-agents`), `sidebar-footer` `workspace-chrome` with `{footer: true}`) and `work` (column: `tabs` mod `mttnb-tabs`, `work-body` row, `status` mod `mttnb-status`). `work-body` holds:
  - `desk`, a column: `desk-header` (mod `mttnb-desk`, role header) and `desk-stack`, a stack of `picker` (`{role: "picker"}`), `spare` (`{role: "spare"}`) and, added at run time, one `desk-<terminal>` block per agent (`{terminal: <address>}`, padding 6);
  - `main`: `{tab: "active", pane: {...}}` with the shipped `pane` header;
  - `panel-body`, a stack of `files` (shipped mod), `changes` (mod `mttnb-changes`) and `graph` (mod `git-graph`), hidden, 380px.
  - Root: `theme {light: mttnb-light, dark: mttnb-dark}`, `titlebar: none`, `traffic_lights [12, 16]`, `background: canvas`, `terminal_padding [14, 12]`, 1px `border` divider, `preview: layouts/mttnb.svg`.
- **`mods/mttnb-desk`**, three roles of one mod:
  - header: draws the header and, on every render, keeps `desk-stack` in step with the shown tab: adds a block for each of the tab's agents (rewriting the layout from the file with `layout.set`, keeping the live sizes, hidden and active from `layout()`), shows the chosen one with `layout.select`, focuses a new one once it shows (`pane.focus {terminal}`), ends agents whose tab is gone (`terminal.kill`). Every second (a `cx.timer`, as Herdr doesn't render the header while the window is in the back) it compares the desks' statuses and alerts for any turning blocked or done (`playSound`, `osascript` `display notification` through `exec`, `notify` with the action `mttnb-desk.agent:<terminal>`). Takes key commands with `nextCommand()`: `agent[:<terminal>]`, `new`, `next`, `prev`, `go-left`, `go-right`.
  - picker: `knownAgents()` (refreshed every minute), starts an agent with `exec`: `hc run --bg --json --keep --no-parent --no-notify --cwd <folder> --label mttnb.role=desk --label mttnb.space=<space> --label mttnb.tab=<tab> --label mttnb.agent=<key> -- /usr/bin/env TERM=xterm-256color COLORTERM=truecolor $SHELL -l -i -c '"$@"' mttnb-desk <agent.run...>` (fish uses `$argv`).
  - spare: draws nothing.
  - Shared state: `mttnb.desk.chosen` (`{tab id: terminal | "picker"}`), `mttnb.desk.focus`, `mttnb.desk.pick`.
  - Icons: Remix Icon `code-s-slash-line` (`code.svg`) and `add-line` (`add.svg`); it also uses the shipped `mods/pane/close.svg` and `mods/workspace-chrome/spinner.svg`.
- **`mods/mttnb-tabs`**, a clone of the shipped `tabs` 0.1.11: Files / Changes / Graph toggle the `panel-body` stack (`layout.select`, `layout.show`, `layout.hide`), also from `nextCommand()` (`files`, `changes`, `graph`); the Graph button shows only when `mods/git-graph/main.js` exists.
- **`mods/mttnb-spaces`**, a clone of the shipped `spaces` 0.1.11, with `store.js` (shared state `mttnb.space.icons`: `{space id: {emoji} | {image}}`; `mttnb.space.groups`: `[{id, name, icon, folded, spaces: [space id]}]`) and `edit.js` (the same mod opened with `openOverlay` and `props.view`: `space-menu` and `group-menu` popups, `icon` and `group` dialogs). It counts the non-`#` lines of the porcelain status as uncommitted changes and always shows the branch. `nextCommand()` takes `pull:<space>`, `push:<space>` and `git:[machine, folder]` (look again at the places in that folder). Pictures: `fs` copies them to `data/mttnb-spaces/icons/` (`cp` for files outside the home folder), shown with `image()`. Icons: the shipped `mods/workspace-chrome` ones, and Remix Icon `arrow-up-s-line` (`up.svg`), `arrow-down-s-line` (`down.svg`), `emotion-line` (`emoji.svg`).
- **`mods/mttnb-status`**, a clone of the shipped `workspace-status` 0.1.11: counts `agents()` plus the live `mttnb.role=desk` terminals it doesn't list (an `error` status counting as blocked).
- **`mods/mttnb-changes`**, a clone of the shipped `changes` 0.1.11: each row and the header get a discard button (armed on the first click, `cx.timer.after` redraws when the 3 s run out); discarding runs `git --literal-pathspecs restore --source=HEAD --staged --worktree -- <paths>` for tracked files (`rm -q -f --` with no HEAD) and `git --literal-pathspecs clean -f -- <paths>` for untracked ones, then refreshes and runs `mttnb-spaces.git:[machine, repo top]` (a discard may not touch `.git`, so the sidebar's watch wouldn't wake). Icon: Remix Icon `arrow-go-back-line` (`discard.svg`).
- **`mods/mttnb-agents`**, a clone of the shipped `agents` 0.1.11: also lists live terminals labelled `mttnb.role=desk` (they have no pane, so Herdr's list leaves them out); clicking one runs `mttnb-desk.agent:<terminal>`.
- **`keys.json`**, section `layout:mttnb`: `ctrl-shift-a` agent, `ctrl-alt-n` new, `ctrl-alt-up` / `ctrl-alt-down` prev / next, `ctrl-alt-left` / `ctrl-alt-right` go-left / go-right, `cmd-g` graph, `ctrl-shift-f` files, `ctrl-shift-g` changes.
- **Optional:** the git-graph mod (github.com/rabeeh-ta/herdr-git-graph) for the Graph panel. It runs `git` in the focused repository and reaches the network only on Fetch / Push.
- Programs run: `hc` (the agents), the person's login shell, the agents themselves, `git` (the spaces' state), `sh` with `lsof` (a shell's folder behind a program already running), `osascript` (macOS's file picker, on Choose…, and the desk agents' notifications) and `cp`.

## Watch out

- Herdr folds a container with one child into that child when it saves the layout, losing its id, size and hidden. Every container here has at least two children: that is what `spare` is for, and why the panel's size and hidden sit on the `panel-body` stack itself rather than on a wrapper column.
- Never write `layout()`'s tree back with `layout.set`: it is already folded. Rewrite from the layout file and copy only size, hidden and active from `layout()`, by id.
- The agents need `--no-parent`: Herdr hangs up an agent's sub-agents when its pane closes, so an agent started under a pane's terminal dies with that pane.
- `pane.focus` on a block that isn't shown yet fails with "no such pane": focus a new agent only once `desk-stack` shows its block.
- Kill agents of closed tabs only for tabs seen earlier in this run, and only while the local machine's layout is `ready`: while the window loads, `spaces()` can be empty or partial.
- Spaces on other machines: the column doesn't start agents there.
- `image()` reads only under the Herdr home: copy a chosen picture there, under a new name each time (an old one stays cached by path).
- A drag ends on mouse-up wherever it is: the list itself clears it, so a space dropped on empty space goes nowhere.
- Space ids in groups and icons stay after a space closes (spaces on a machine that's away aren't listed meanwhile); they are simply not drawn.
- The layout file stores the agents' blocks while they run; a fresh install starts with only `picker` and `spare`.

## Done when

- `herdr-app check` passes for `mttnb-desk`, `mttnb-tabs`, `mttnb-agents`, `mttnb-spaces`, `mttnb-status` and `mttnb-changes`, and `layout.switch {"name": "mttnb"}` shows the three cards with the picker on the left.
- Clicking an installed agent starts it in the tab's folder, adds its header tab and puts the keyboard in it; `hc ls` shows it with `mttnb.tab` set to the shown tab.
- `+` and a second agent: both header tabs show, each click switches the column, Ctrl+Alt+Up / Down cycle them.
- `tab.new` shows the picker in the new tab; switching back shows the old tab's agents unchanged.
- Splitting a pane on the right and closing it leaves the column's agent running; closing the tab ends its agents.
- Files / Changes / Graph open and close the right panel, survive a resize of the panel, and adding an agent doesn't close it.
- In a repo with an edited, an added and an untracked file, Changes discards each from its row after a second click, and Discard all clears the list; a single click does nothing after 3 seconds.
- Ctrl+Alt+Left from the leftmost pane enters the column; Ctrl+Alt+Right returns to the same pane.
- A repo with an edited file, an unpushed commit and an unpulled one shows `main ●1 ↑1 ↓1` after its name.
- Change icon… with an emoji, then with a picture: the row shows it; Identicon brings its pattern back.
- Right-click a space in a repo with a remote → Pull: an arrow pulses after its name, then a toast says "Pulled <space>"; a space outside git has no Pull / Push.
- A new group with an emoji: dragging two spaces onto its header lists them under it on its line, the last one ending it; a click folds it, and an edited file in one of them shows `●1` on the header; Delete group puts them back.
- With one agent working in the column, the status bar says "1 agent · 1 working".
