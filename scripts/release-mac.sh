#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
profile="${FOLIO_NOTARY_PROFILE:?Set FOLIO_NOTARY_PROFILE to your existing notarization Keychain profile}"
xcrun notarytool history --keychain-profile "$profile" >/dev/null
identity="${CSC_NAME:-}"
if [ -z "$identity" ]; then
  identity="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p')"
  count="$(printf '%s\n' "$identity" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$count" -ne 1 ]; then
    echo 'Set CSC_NAME to choose exactly one Developer ID Application certificate.' >&2
    exit 1
  fi
fi
export APPLE_KEYCHAIN_PROFILE="$profile"
version="$(node -p 'require("./package.json").version')"
output="dist-packaged/v$version"
pnpm build
pnpm exec electron-builder --mac --publish never \
  --config.forceCodeSigning=true \
  --config.mac.identity="${identity#Developer ID Application: }" \
  --config.dmg.sign=true \
  --config.directories.output="$output" \
  --config.artifactBuildCompleted=scripts/notarize-dmg.cjs
for bundle in "$output"/mac*/Folio.app; do
  codesign --verify --deep --strict "$bundle"
  spctl --assess --type execute --verbose=4 "$bundle"
  xcrun stapler validate "$bundle"
done
echo "Verified macOS release ready in $output"
