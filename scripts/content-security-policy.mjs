// The Content Security Policy (D-0000-29, SEC-15.AC-1). It goes into the built
// page only: the dev server needs inline scripts that this policy would block.
/** Each directive of the page's policy; vercel.json sends the same list plus frame-ancestors. */
export const pageDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
];

export const contentSecurityPolicy = pageDirectives.join("; ");
