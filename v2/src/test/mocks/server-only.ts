// Mock for `server-only` package.
// The real package throws when imported in a browser (window-defined) context.
// In Vitest (jsdom), we want server-only modules to be importable for unit testing.
// This no-op mock replaces the package during test runs only.
export {}
