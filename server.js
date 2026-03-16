
const WORKER_URL = "https://allowed-api.name1ess404.workers.dev";


const express = require("express");
const puppeteer = require("puppeteer");
const cors = require('cors');

const fetch = global.fetch;

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------ CONFIG ------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "mypass";

app.use(cors());
app.use(express.json()); // needed for POST JSON parsing

// ------------------ HELPER FUNCTIONS ------------------

async function isAllowed(req) {

    const deviceId = req.headers["x-device-id"];
    if (!deviceId) return false;

    try {

        const res = await fetch(WORKER_URL + "/get");
        const allowedDevices = await res.json();

        return allowedDevices.includes(deviceId);

    } catch (err) {
        console.log("Worker error", err);
        return false;
    }
}



/*function loadAllowedDevices() {
    try {
        const data = fs.readFileSync("allowed.json", "utf8");
        return JSON.parse(data);
    } catch (err) {
        console.error("Failed to load allowed.json", err);
        return [];
    }
}

function isAllowed(req) {
    const deviceId = req.headers["x-device-id"];
    if (!deviceId) return false;

    const allowedDevices = loadAllowedDevices(); // dynamic every request
    return allowedDevices.includes(deviceId);
}*/

// ------------------ ADMIN ENDPOINT ------------------

// ------------------ PING ------------------
app.get("/ping", async (req, res) => {
    if (!(await isAllowed(req))) {
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Device not allowed" });
    }
    res.send("OK");
});

// ------------------ EXTRACT ------------------
app.get("/extract", async (req, res) => {
    if (!(await isAllowed(req))) {
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Device not allowed" });
    }

    const classUrl = req.query.url;
    if (!classUrl) return res.status(400).json({ error: "Missing url parameter" });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        });

        const page = await browser.newPage();

        // Timeout settings
        await page.setDefaultNavigationTimeout(90000);
        await page.setDefaultTimeout(90000);

        // Set cookies
        const cookies = JSON.parse(process.env.COOKIES_JSON || "[]");
        if (cookies.length) await page.setCookie(...cookies);

        // Go to class URL
        await page.goto(classUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

        // Wait for iframe
        await page.waitForFunction(() => {
            const iframe = document.querySelector("iframe");
            return iframe && iframe.src && iframe.src.includes("youtube");
        }, { timeout: 90000 });

        const iframeSrc = await page.evaluate(() => {
            const iframe = document.querySelector("iframe");
            return iframe ? iframe.src : null;
        });

        if (!iframeSrc) return res.status(404).json({ error: "No iframe found" });

        // Convert to normal YouTube link
        let url = iframeSrc;
        if (url.includes("/embed/")) {
            const id = url.split("/embed/")[1].split("?")[0];
            url = "https://www.youtube.com/watch?v=" + id;
        }

        res.json({ youtube: url });
    } catch (err) {
        console.error("ERROR OCCURRED:", err);
        res.status(500).json({ error: "Something went wrong", details: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
