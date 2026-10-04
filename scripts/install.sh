#!/usr/bin/env sh
# install.sh — aio Linux/macOS installer (standalone binary, NO Node required).
# Explicit download-then-run — nothing remote is piped into a shell:
#   curl -fsSL -o /tmp/aio-install.sh https://github.com/MRaihan-XXL/all-in-one/releases/latest/download/install.sh
#   sh /tmp/aio-install.sh [vX.Y.Z]
# Assets are SHA256-verified against the release's SHA256SUMS before they land.
set -eu

REPO="MRaihan-XXL/all-in-one"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os-$arch" in
  linux-x86_64)  asset="aio-linux-x64" ;;
  linux-aarch64) asset="aio-linux-arm64" ;;
  darwin-x86_64) asset="aio-darwin-x64" ;;
  darwin-arm64)  asset="aio-darwin-arm64" ;;
  *) echo "install.sh: unsupported platform: $os $arch" >&2; exit 1 ;;
esac

if [ "${1:-}" ]; then
  case "$1" in v*) tag="$1" ;; *) tag="v$1" ;; esac
else
  tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
  [ -n "$tag" ] || { echo "install.sh: could not resolve latest release" >&2; exit 1; }
fi
BASE="https://github.com/$REPO/releases/download/$tag"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "installing aio $tag ($asset) -> $BIN_DIR"

curl -fsSL -o "$tmp/$asset" "$BASE/$asset"
curl -fsSL -o "$tmp/SHA256SUMS" "$BASE/SHA256SUMS"

want=$(grep -F "$asset" "$tmp/SHA256SUMS" | head -n 1 | cut -d' ' -f1)
[ -n "$want" ] || { echo "install.sh: SHA256SUMS has no entry for $asset — release may be mid-upload" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  got=$(sha256sum "$tmp/$asset" | cut -d' ' -f1)
else
  got=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
fi
if [ "$want" != "$got" ]; then
  echo "install.sh: SHA256 MISMATCH for $asset (want $want got $got) — nothing installed" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
install -m 755 "$tmp/$asset" "$BIN_DIR/aio"
"$BIN_DIR/aio" --version

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  # interpolate $BIN_DIR (pasting a literal "$BIN_DIR" prepends empty + ":" to PATH)
  *) echo "note: add to PATH:  export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo "remove: \`aio rollback\` first if you ran setup, then delete $BIN_DIR/aio"
