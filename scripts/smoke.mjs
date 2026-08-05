const base = 'http://localhost:3000';
async function hit(path) {
  const r = await fetch(base + path, { redirect: 'manual' });
  const body = await r.text();
  return `${path} -> ${r.status} ${r.headers.get('content-type') || ''}\n` +
    body.slice(0, 300);
}
console.log(await hit('/api/metrics'));
console.log('---');
console.log(await hit('/api/entries'));
console.log('---');
const home = await fetch(base + '/', { redirect: 'manual' });
console.log('/ ->', home.status);
