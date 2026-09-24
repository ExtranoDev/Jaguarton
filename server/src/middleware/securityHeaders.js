// Helmet-style response headers, written out rather than pulled in as a dependency because a
// JSON API needs only a handful. The API never serves HTML, so the CSP simply forbids everything.
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

function securityHeaders(req, res, next) {
  res.set(HEADERS);
  next();
}

module.exports = { securityHeaders };
