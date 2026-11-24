export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
export const get = (path: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost' + path, { headers });
// Responses are checked field by field in the tests, so they stay loosely typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const json = async (response: Response) => (await response.json()) as Record<string, any>;
// The cookie header a browser would send back after a Set-Cookie.
export const cookieFrom = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0];
