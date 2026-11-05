// The browser build of the Lua VM expects `window` when it loads. Giving it one lets the
// tests exercise the same file the site ships, rather than a separate Node build.
(globalThis as any).window ??= globalThis;
