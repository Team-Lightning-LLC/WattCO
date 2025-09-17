import { base, auth } from './_util.js';
export default async (req) => {
  const id = req.url.split('object-')[1];
  const r = await fetch(`${base}/objects/${id}`, {
    method: req.method, headers: auth
  });
  return new Response(await r.text(), { status:r.status, headers:{'Content-Type':'application/json'} });
};

