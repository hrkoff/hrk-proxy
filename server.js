/**
 * HRK Stream Proxy
 * HTTP -> HTTPS Proxy for HLS (.m3u8), TS and MP4
 */

const express = require("express");
const { Readable } = require("stream");

const app = express();

const PORT = process.env.PORT || 3000;

// ضع مفتاحًا سريًا خاصًا بك
const SECRET_KEY = "CHANGE_ME_TO_A_LONG_RANDOM_STRING";

// CORS
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// الصفحة الرئيسية
app.get("/", (req, res) => {
    res.send("HRK Proxy is running ✅");
});

// البروكسي
app.get("/proxy", async (req, res) => {

    const { url, key } = req.query;

    if (key !== SECRET_KEY) {
        return res.status(403).send("Forbidden");
    }

    if (!url) {
        return res.status(400).send("Missing url");
    }

    try {

        const headers = {};

        if (req.headers.range) {
            headers["Range"] = req.headers.range;
        }

        const upstream = await fetch(url, {
            headers
        });

        if (!upstream.ok && upstream.status !== 206) {
            return res.status(upstream.status).send("Upstream Error");
        }

        const contentType = upstream.headers.get("content-type") || "";

        const isPlaylist =
            url.toLowerCase().includes(".m3u8") ||
            contentType.includes("mpegurl") ||
            contentType.includes("m3u8");

        if (isPlaylist) {

            const text = await upstream.text();

            const rewritten = rewritePlaylist(
                text,
                url,
                req
            );

            res.setHeader(
                "Content-Type",
                "application/vnd.apple.mpegurl"
            );

            return res.send(rewritten);
        }

        [
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges"
        ].forEach(h => {

            const v = upstream.headers.get(h);

            if (v) {
                res.setHeader(h, v);
            }

        });

        res.status(upstream.status);

        Readable.fromWeb(upstream.body).pipe(res);

    } catch (e) {

        console.error(e);

        res.status(500).send(e.message);

    }

});

function rewritePlaylist(text, baseUrl, req) {

    const base = new URL(baseUrl);

    const proxyBase =
        ${req.protocol}://${req.get("host")}/proxy;

    const key = req.query.key;

    return text
        .split("\n")
        .map(line => {

            const t = line.trim();

            if (!t) return line;

            if (t.startsWith("#")) {

                const match = t.match(/URI="([^"]+)"/);

                if (match) {

                    const absolute =
                        new URL(match[1], base).href;

                    const proxy =
                        ${proxyBase}?key=${encodeURIComponent(key)}&url=${encodeURIComponent(absolute)};

                    return line.replace(match[1], proxy);
                }

                return line;
            }

            const absolute =
                new URL(t, base).href;

            return ${proxyBase}?key=${encodeURIComponent(key)}&url=${encodeURIComponent(absolute)};

        })
        .join("\n");

}

app.listen(PORT, () => {
    console.log(HRK Proxy listening on port ${PORT});
});
