#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
local_cargo_home="$project_root/.tools/cargo"
local_rustup_home="$project_root/.tools/rustup"

if [ -x "$local_cargo_home/bin/cargo" ]; then
  export CARGO_HOME="$local_cargo_home"
  export RUSTUP_HOME="$local_rustup_home"
  export PATH="$local_cargo_home/bin:$PATH"
fi

if [ ! -t 1 ] && [ -z "${CI:-}" ]; then
  export CI=true
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm_command="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  pnpm_command="corepack pnpm"
else
  echo "pnpm or corepack is required to run Tauri" >&2
  exit 1
fi

exec $pnpm_command tauri "$@"
