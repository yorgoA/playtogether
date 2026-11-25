import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

// A certificate for this computer, so phones on the Wi-Fi get a secure page: browsers only share motion
// sensors with one. Kept in node_modules/.cache and never committed. Phones warn about it once.
export function localHttps(address) {
  const name = address || '127.0.0.1';
  const dir = 'node_modules/.cache/local-https/' + name;
  const key = dir + '/key.pem';
  const cert = dir + '/cert.pem';
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    try {
      execFileSync(
        'openssl',
        [
          ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365'],
          ...['-subj', '/CN=PlayTogether local', '-keyout', key, '-out', cert],
          ...['-addext', `subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${name}`],
          ...['-addext', 'extendedKeyUsage=serverAuth'],
        ],
        { stdio: 'pipe' },
      );
    } catch (e) {
      throw new Error('npm run dev:https needs openssl to make a local certificate. ' + e.message);
    }
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

// Vite serves https over HTTP/2, which sends `:authority` instead of Host. vinext compares Host with the page's
// address and, without it, takes a phone on the Wi-Fi for another site and blocks it.
export const hostHeader = {
  name: 'host-header',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (!req.headers.host && req.headers[':authority']) {
        req.headers.host = req.headers[':authority'];
        // The Worker's request is built from these.
        req.rawHeaders.push('host', req.headers.host);
      }
      next();
    });
  },
};
