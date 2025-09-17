export const base = process.env.VERTESIA_API_BASE || 'https://api.vertesia.io/api/v1';
export const auth = { Authorization: `Bearer ${process.env.VERTESIA_API_KEY}` };

export async function proxy(req, path){
  const url = new URL(req.url);
  const qs = url.search ? url.search : '';
  const upstream = `${base}/${path}${qs}`;
  const init = {
    method: req.method,
    headers: { 'Content-Type':'application/json', ...auth },
    body: ['GET','HEAD'].includes(req.method) ? undefined : await req.text()
  };
  const r = await fetch(upstream, init);
  return new Response(await r.text(), { status:r.status, headers:{'Content-Type': r.headers.get('content-type')||'application/json'} });
}
