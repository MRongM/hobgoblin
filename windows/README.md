# Hobgoblin for Windows

This directory is the independent Windows platform package. Run all Windows development, test, typecheck, and release commands from this directory.

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build:release -- --arch x64
```

Generated web assets and installers are written to `dist/` and `release/` in this directory.
