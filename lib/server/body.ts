// The most a request body may hold, in bytes. Every real request is far smaller.
export const maxBody = 2500;

// Reads a body as text, or gives null as soon as it passes `limit` bytes, without reading the rest.
export async function readText(req: Request, limit = maxBody): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > limit) {
      // Nothing more is needed from the sender, so a failed cancel does not matter.
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}
