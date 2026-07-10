/**
 * HRK Stream Proxy
 * -----------------
 * كيحول أي رابط بث http:// (TS, MP4, أو m3u8/HLS) لرابط https://
 * باش يخدم جوة WebView محمي بـ https بلا Mixed Content Blocking.
 *
 * يشتغل بـ Node.js 18+ (كيستعمل fetch المدمج).
 */

const express = require('express');
const app = express();

// ⚠️ بدل هاد المفتاح بواحد سري ديالك (أي نص عشوائي طويل)
// هذا كيمنع أي حد آخر يستعمل السيرفر ديالك كـ proxy مجاني
const SECRET_KEY = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

const PORT = process.env.PORT || 3000;

// السماح لكل origins (التطبيق ديالك) يوصلو للسيرفر
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/**
 * نقطة الدخول الرئيسية:
 * GET /proxy?key=SECRET_KEY&url=http://example.com/stream.m3u8
 */
app.get('/proxy', async (req, res) => {
  const { key, url } = req.query;

  if (key !== SECRET_KEY) {
    return res.status(403).send('Forbidden: invalid key');
  }
  if (!url) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    const upstreamHeaders = {};
    // نمرر Range header باش يخدم seek/buffering فالفيديو
    if (req.headers.range) upstreamHeaders['Range'] = req.headers.range;

    const upstream = await fetch(url, { headers: upstreamHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send('Upstream error: ' + upstream.status);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isPlaylist = url.toLowerCase().includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8');

    if (isPlaylist) {
      // ═══ حالة m3u8: خاصنا نصلح الروابط الداخلية باش تمر عبر الـ proxy ═══
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, url, req);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    // ═══ حالة بث مباشر (TS / MP4 / segment) — نمررو كيفما هو ═══
    res.status(upstream.status);
    const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    passHeaders.forEach(h => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    // Node 18+: تحويل الـ Web ReadableStream لـ Node stream
    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).send('Bad Gateway: ' + err.message);
  }
});

/**
 * كيصلح كل سطر فـ m3u8 يشير لرابط (نسبي أو كامل)
 * ويعوضو برابط يمر عبر /proxy تاعنا
 */
function rewritePlaylist(text, baseUrl, req) {
  const base = new URL(baseUrl);
  const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;
  const key = req.query.key;

  const lines = text.split('\n');
  const out = lines.map(line => {
    const trimmed = line.trim();

    // أسطر فارغة أو تعليقات ما فيهاش رابط (باستثناء بعض tags فيها URI=)
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      // بعض الـ tags (زي #EXT-X-KEY أو #EXT-X-MAP) فيها URI="..."
      const uriMatch = trimmed.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const resolved = new URL(uriMatch[1], base).href;
        const proxied = `${proxyBase}?key=${encodeURIComponent(key)}&url=${encodeURIComponent(resolved)}`;
        return line.replace(uriMatch[1], proxied);
      }
      return line;
    }

    // سطر عادي = رابط لملف (segment .ts أو playlist فرعي .m3u8)
    const resolved = new URL(trimmed, base).href;
    return `${proxyBase}?key=${encodeURIComponent(key)}&url=${encodeURIComponent(resolved)}`;
  });

  return out.join('\n');
}

app.get('/', (req, res) => {
  res.send('HRK Proxy is running ✅');
});

app.listen(PORT, () => {
  console.log(`HRK Proxy listening on port ${PORT}`);
});
