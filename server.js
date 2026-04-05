const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const path = require("path");

const fetch = global.fetch;

const app = express();
const PORT = process.env.PORT || 3000;

const WORKER_URL = "https://allowed-api.name1ess404.workers.dev";

app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.use(express.json());

// ------------------ CSP ------------------
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src * https://allowed-api.name1ess404.workers.dev https://yt-extractor-0j91.onrender.com"
  );
  next();
});

// ------------------ BROWSER ------------------
let browser;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--no-first-run",
        "--no-zygote",
        "--single-process"
      ]
    });
  }
}

// ------------------ CACHE ------------------
const cache = new Map();
const MAX_CACHE = 100;

function addToCache(key, value) {
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

// ------------------ HELPER ------------------
async function isAllowed(req) {
  const deviceId = req.headers["x-device-id"];
  if (!deviceId) return false;

  try {
    const res = await fetch(WORKER_URL + "/get");
    const allowedDevices = await res.json();
    return allowedDevices.includes(deviceId);
  } catch (err) {
    console.error("Worker error:", err);
    return false;
  }
}

// ------------------ ROUTES ------------------

// PING
app.get("/ping", async (req, res) => {
  if (!(await isAllowed(req))) {
    return res.status(403).json({ error: "UNAUTHORIZED" });
  }
  res.send("OK");
});

// EXTRACT
app.get("/extract", async (req, res) => {
    await initBrowser();

    if (!(await isAllowed(req))) {
        return res.status(403).json({ error: "UNAUTHORIZED" });
    }

    const classUrl = req.query.url;
    if (!classUrl) {
        return res.status(400).json({ error: "Missing url" });
    }

    if (cache.has(classUrl)) {
        return res.json({ youtube: cache.get(classUrl) });
    }

    let page;

    try {
        page = await browser.newPage();

        await page.setDefaultNavigationTimeout(90000);
        await page.setDefaultTimeout(90000);

        const cookies = JSON.parse(process.env.COOKIES_JSON || "[]");
        if (cookies.length) await page.setCookie(...cookies);

        // 🔥 IMPORTANT CHANGE
        await page.goto(classUrl, {
            waitUntil: "networkidle2", // WAIT FULL LOAD
            timeout: 90000
        });

        // 🔥 WAIT UNTIL URL IS STILL /live/ (not redirected)
        await page.waitForFunction(() => {
            return window.location.href.includes("/live/");
        }, { timeout: 90000 });

        // 🔥 WAIT UNTIL CORRECT IFRAME APPEARS (NOT HOMEPAGE ONE)
        await page.waitForFunction(() => {
            const iframes = document.querySelectorAll("iframe");
            return Array.from(iframes).some(f => 
                f.src && 
                f.src.includes("youtube") &&
                f.src.includes("embed")
            );
        }, { timeout: 90000 });

        // GET ALL IFRAMES
        const iframeUrls = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("iframe"))
                .map(f => f.src)
                .filter(src => src && src.includes("youtube"));
        });

        if (!iframeUrls.length) {
            return res.status(404).json({ error: "No YouTube iframe found" });
        }

        // 🔥 VERY IMPORTANT: pick iframe that belongs to THIS PAGE
        const correctIframe = iframeUrls.find(src => 
            src.includes("acsfutureschool.com") // bound to page
        ) || iframeUrls[0];

        let videoId = null;

        try {
            const urlObj = new URL(correctIframe);

            if (urlObj.pathname.includes("/embed/")) {
                videoId = urlObj.pathname.split("/embed/")[1].split("/")[0];
            }

        } catch {}

        if (!videoId) {
            return res.status(500).json({ error: "Failed to extract video ID" });
        }

        const finalUrl = `https://www.youtube.com/watch?v=${videoId}`;

        addToCache(classUrl, finalUrl);

        res.json({ youtube: finalUrl });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Extraction failed" });
    } finally {
        if (page && !page.isClosed()) {
            await page.close();
        }
    }
});

// ------------------ START ------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
