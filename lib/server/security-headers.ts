// Added by the Worker to every page and API reply. Static files are served before it runs and keep their own.
const headers: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  // Other sites see the origin only, never a path such as /join?code=ABCD.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // No other site may show the game in a frame, so it cannot trick a player into clicking.
  'X-Frame-Options': 'DENY',
  // Scripts and styles are not restricted yet: vinext and the 3D scenes would need a nonce for each inline one.
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  // Motion controls keep the sensors. Nothing here uses the camera, microphone, location or payments.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export function withSecurityHeaders(res: Response, https: boolean): Response {
  // A WebSocket handshake goes back as it is.
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(headers))
    if (!out.headers.has(name)) out.headers.set(name, value);
  if (https && !out.headers.has('Strict-Transport-Security'))
    out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return out;
}
