#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -ne 2 ]]; then
  printf '%s\n' 'Usage: bash scripts/build-dmg.sh path/to/Brainwave.app path/to/installer.dmg' >&2
  exit 1
fi

python_command="${BRAINWAVE_DMG_PYTHON:-python3}"
"$python_command" -c 'import sys; assert sys.version_info >= (3, 10), "DMG packaging requires Python 3.10+; set BRAINWAVE_DMG_PYTHON to its executable"'
venv=src-tauri/target/dmgbuild-venv
if [[ ! -x "$venv/bin/python" ]]; then
  "$python_command" -m venv "$venv"
fi
"$venv/bin/python" -m pip install --disable-pip-version-check -r scripts/dmg/requirements.txt
mkdir -p "$(dirname "$2")"
"$venv/bin/dmgbuild" -s scripts/dmg/settings.py -D "app=$1" Brainwave "$2"
"$venv/bin/python" scripts/verify-dmg.py "$2"
printf 'macOS installer: %s\n' "$2"
