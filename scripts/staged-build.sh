#!/usr/bin/env bash
# Build without creating dependency directories in the submission repository.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="${ERC20T_BUILD_DIR:-/tmp/erc20t-build}"
mkdir -p "$build_dir"
cp "$project_dir/package.json" "$project_dir/package-lock.json" "$project_dir/tsconfig.json" "$project_dir/vite.config.ts" "$project_dir/index.html" "$build_dir/"
rm -rf "$build_dir/src" "$build_dir/public"
cp -R "$project_dir/src" "$project_dir/public" "$build_dir/"
npm --prefix "$build_dir" run typecheck
npm --prefix "$build_dir" run build
rm -rf "$project_dir/dist"
cp -R "$build_dir/dist" "$project_dir/dist"
