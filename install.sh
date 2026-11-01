#!/bin/sh
# Installs mttnb into the Herdr home: copies layouts/, themes/ and mods/, adds the
# layout:mttnb key section to keys.json, then switches to the layout.
set -e

here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}

mkdir -p "$home/layouts" "$home/themes" "$home/mods"
cp "$here"/layouts/mttnb.json "$here"/layouts/mttnb.svg "$home/layouts/"
cp "$here"/themes/mttnb-*.json "$home/themes/"
for m in mttnb-desk mttnb-tabs mttnb-agents mttnb-spaces; do
  rm -rf "$home/mods/$m"
  cp -R "$here/mods/$m" "$home/mods/$m"
done

if command -v python3 >/dev/null 2>&1; then
  [ -f "$home/keys.json" ] && cp "$home/keys.json" "$home/keys.json.bak"
  python3 - "$home/keys.json" "$here/keys.json" <<'EOF'
import json, os, sys
dst, src = sys.argv[1], sys.argv[2]
keys = json.load(open(dst)) if os.path.exists(dst) else {}
keys.update(json.load(open(src)))
with open(dst, "w") as f:
    json.dump(keys, f, indent=2, ensure_ascii=False)
    f.write("\n")
EOF
else
  echo "python3 not found: add the \"layout:mttnb\" section of keys.json to $home/keys.json yourself."
fi

if command -v herdr-app >/dev/null 2>&1; then
  herdr-app do layout.switch '{"name":"mttnb"}' >/dev/null && echo "mttnb installed and selected."
else
  echo "mttnb installed. Pick it in Herdr's layout menu."
fi
