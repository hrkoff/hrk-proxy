/**
 * HRK Stream Proxy
 * HTTP -> HTTPS Proxy for HLS (.m3u8), TS and MP4
 */

const express = require("express");
const { Readable } = require("stream");

const app = express();

const PORT = process.env.PORT || 3000;

// CORS
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.get("/", (req, res) => {
    res.send("HRK Proxy is running ✅");
});

app.get("/proxy", async (req, res) => {

    const { url } = req.query;

    if (!url) {
        return res.status(400).send("Missing url");
    }

    try {

        const headers = {};

        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        const upstream = await fetch(url, { headers });

        if (!upstream.ok && upstream.status !== 206) {
            return res.status(upstream.status).send("Upstream Error");
        }

        const contentType = upstream.headers.get("content-type") || "";

        const isPlaylist =
            url.toLowerCase().includes(".m3u8") ||
            contentType.includes("mpegurl") ||
            contentType.includes("m3u8");

        if (isPlaylist) {

            const playlist = await upstream.text();

            const rewritten = rewritePlaylist(
                playlist,
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
        ].forEach(name => {

            const value = upstream.headers.get(name);

            if (value) {
                res.setHeader(name, value);
            }

        });

        res.status(upstream.status);

        Readable.fromWeb(upstream.body).pipe(res);

    } catch (err) {

        console.error(err);

        res.status(500).send(err.message);

    }

});

function rewritePlaylist(text, baseUrl, req) {

    const base = new URL(baseUrl);

    const proxyBase = ${req.protocol}://${req.get("host")}/proxy;

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
                        ${proxyBase}?url=${encodeURIComponent(absolute)};

                    return line.replace(match[1], proxy);
                }

                return line;
            }

            const absolute =
                new URL(t, base).href;

            return ${proxyBase}?url=${encodeURIComponent(absolute)};

        })
        .join("\n");

}

app.listen(PORT, () => {

    console.log(HRK Proxy listening on port ${PORT});

});
