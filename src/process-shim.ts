// Vite's production build rewrites guards such as `globalThis.process?.env` in dependencies to a constant, which
// leaves bare `process.exitCode` accesses behind. WebKit has no `process`, so PGlite 0.4.x crashed in Safari/iOS.
// A tiny stand-in keeps those accesses harmless; `process.versions.node` stays undefined so nothing thinks it is Node.
const g = globalThis as unknown as { process?: { env: Record<string, string>; exitCode?: number } };
if (typeof g.process === 'undefined') g.process = { env: {} };
export {};
