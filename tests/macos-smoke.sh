#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob
images=("src-tauri/target/$1/release/bundle/dmg/"*.dmg)
if [ "${#images[@]}" -ne 1 ]; then
  echo "Expected exactly one DMG for the desktop smoke test." >&2
  exit 1
fi
mount_dir="$(mktemp -d)"
mounted=false
cleanup() {
  if [ "$mounted" = true ]; then
    hdiutil detach "$mount_dir" -quiet || hdiutil detach "$mount_dir" -force -quiet
  fi
  rmdir "$mount_dir"
}
trap cleanup EXIT
hdiutil attach "${images[0]}" -readonly -nobrowse -mountpoint "$mount_dir"
mounted=true
codesign --verify --deep --strict "$mount_dir/JSONL Viewer.app"
node tests/desktop-smoke.mjs "$mount_dir/JSONL Viewer.app/Contents/MacOS/JSONL Viewer"
