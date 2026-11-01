# herdr-mttnb

English | [中文](README_ZH.md)

A layout and theme for the Herdr desktop app: a fixed column of coding agents on the left, terminals on the right as usual, and a Git commit graph you can open beside them.

<!-- screenshot -->

## Features

- **Coding column on the left**: lists every agent Herdr supports (installed ones first, the others greyed out). Click one, or press `1`–`9`, to start it in the current folder.
- **Each tab has its own agents**: a new tab starts with an empty picker. A tab can run several agents: switch between them with the tabs at the top of the column, `+` opens another, and "End" (click twice) ends the shown one.
- **Closing splits leaves the column alone**: the column's agents don't belong to any terminal pane, so closing panes or terminals on the right never takes them down. They end when their tab closes.
- **The sidebar's Agents list** also shows the column's agents; click one to jump to it.
- **Graph panel**: the Files / Changes / Graph buttons on the right of the tab bar open that panel on the right; click again to close it. Graph needs the Git Graph mod (see below); without it the button doesn't show.
- **Colours**: a warm dark theme `mttnb-dark` and a light theme `mttnb-light`, following the system appearance.

## Install

Requires the Herdr desktop app 0.1.11 or later.

```sh
git clone https://github.com/Licoy/herdr-mttnb
sh herdr-mttnb/install.sh
```

The script copies `layouts/`, `themes/` and `mods/` into `~/.config/herdr-app` (or `HERDR_APP_HOME` when set), merges the key bindings into `keys.json` (the old file is kept as `keys.json.bak`), then switches to the mttnb layout.

To install by hand, copy the `layouts`, `themes` and `mods` folders into your Herdr home, add the `layout:mttnb` section of `keys.json` to your own `keys.json`, then run:

```sh
herdr-app do layout.switch '{"name":"mttnb"}'
```

### Graph panel (optional)

```sh
git clone https://github.com/rabeeh-ta/herdr-git-graph
cp -R herdr-git-graph/mods/git-graph ~/.config/herdr-app/mods/
```

Git Graph only runs `git` in your repositories, and goes online only when you click Fetch / Push.

## Keys

Active in the mttnb layout only.

| Key | Action |
| --- | --- |
| `Ctrl+Shift+A` | Back to the column's agent (opens the picker when there is none) |
| `Ctrl+Alt+N` | Start another agent |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | Previous / next agent in the column |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | Move between the column and the terminals |
| `Cmd+G` | Open / close Graph |
| `Ctrl+Shift+F` | Open / close Files |
| `Ctrl+Shift+G` | Open / close Changes |

## Notes

- The column's agents are background terminals started with `hc run --no-parent`, labelled `mttnb.role=desk`, `mttnb.space`, `mttnb.tab` and `mttnb.agent`; `hc ls` lists them.
- Starting agents in the column isn't supported yet for spaces on remote machines.
- `mods/mttnb-tabs` and `mods/mttnb-agents` are clones of Herdr's own `tabs` and `agents` mods, modified.
- Icons are from [Remix Icon](https://remixicon.com) (Apache-2.0).

## Uninstall

Delete these from `~/.config/herdr-app` and remove the `layout:mttnb` section from `keys.json`:

```
layouts/mttnb.json
layouts/mttnb.svg
themes/mttnb-dark.json
themes/mttnb-light.json
mods/mttnb-desk/
mods/mttnb-tabs/
mods/mttnb-agents/
```

## License

[MIT](LICENSE)
