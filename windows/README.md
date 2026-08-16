# Hobgoblin for Windows

This directory is the independent Windows platform package. Run all Windows development, test, typecheck, and release commands from this directory.

For terminal workflows, WSL with a Unix-like terminal environment is recommended. When a usable default WSL distribution is installed, Hobgoblin prefers it for internal terminals and external Windows Terminal launches, while retaining native Windows shell fallbacks when WSL is unavailable.

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build:release -- --arch x64
```

Generated web assets and installers are written to `dist/` and `release/` in this directory.
