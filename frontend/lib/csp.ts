export const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'nonce-__CSP_NONCE__'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

export function buildContentSecurityPolicy(nonce?: string) {
  return cspDirectives
    .map((directive) => directive.replace("'nonce-__CSP_NONCE__'", nonce ? `'nonce-${nonce}'` : "'self'"))
    .join("; ");
}
