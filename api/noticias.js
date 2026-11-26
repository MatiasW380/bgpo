// Vercel Serverless Function: /api/noticias
// Junta los titulares de La Voz y Cadena 3 (vía Google Noticias) y los
// devuelve como JSON. Corre en el servidor, así no hay problemas de CORS.

const FUENTES = [
  { nombre: 'La Voz',   q: 'site:lavoz.com.ar when:1d' },
  { nombre: 'Cadena 3', q: 'site:cadena3.com when:1d' },
];

// Titulares que no conviene mostrar en la sala de espera.
// Si querés ver todo, dejá la lista vacía: const EXCLUIR = [];
const EXCLUIR = [
  'femicid', 'asesin', 'homicid', 'crimen', 'violac', 'abuso',
  'muerto', 'muerte', 'murió', 'cadáver', 'suicid', 'balacera', 'baleado',
];

const MAX_TITULARES = 15;

function limpiar(txt) {
  return txt
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function leerFuente({ nombre, q }) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
              '&hl=es-419&gl=AR&ceid=AR:es-419';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (sala de espera BGPO)' } });
  if (!res.ok) throw new Error(nombre + ': HTTP ' + res.status);
  const xml = await res.text();

  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = m[1].match(/<title>([\s\S]*?)<\/title>/);
    const d = m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!t) continue;
    // Google agrega " - Nombre del medio" al final: se lo sacamos
    const titulo = limpiar(t[1]).replace(/\s+-\s+[^-]+$/, '');
    items.push({ titulo, fuente: nombre, fecha: d ? Date.parse(d[1]) : 0 });
  }
  return items;
}

module.exports = async (req, res) => {
  const resultados = await Promise.allSettled(FUENTES.map(leerFuente));

  const vistos = new Set();
  const titulares = resultados
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(n => n.titulo.length > 15)
    .filter(n => !EXCLUIR.some(p => n.titulo.toLowerCase().includes(p)))
    .sort((a, b) => b.fecha - a.fecha)
    .filter(n => {
      const k = n.titulo.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, MAX_TITULARES)
    .map(({ titulo, fuente }) => ({ titulo, fuente }));

  // Vercel guarda la respuesta 10 minutos: Google recibe pocas consultas
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
  res.status(200).json({ actualizado: new Date().toISOString(), titulares });
};
