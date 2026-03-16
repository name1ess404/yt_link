const express = require("express");
const puppeteer = require("puppeteer");
const cors = require('cors');
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------ CONFIG ------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "name0102less2010!@#";

app.use(cors());
app.use(express.json()); // needed for POST JSON parsing

// ------------------ HELPER FUNCTIONS ------------------
function loadAllowedDevices() {
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
}

// ------------------ ADMIN ENDPOINT ------------------
app.post('/allow-device', (req, res) => {
    const { deviceId, adminPass } = req.body;
    if (adminPass !== ADMIN_PASSWORD) {
        return res.json({ success: false, error: "Wrong password!" });
    }

    const allowedPath = './allowed.json';
    let allowed = [];
    if (fs.existsSync(allowedPath)) allowed = JSON.parse(fs.readFileSync(allowedPath));

    if (!allowed.includes(deviceId)) {
        allowed.push(deviceId);
        fs.writeFileSync(allowedPath, JSON.stringify(allowed, null, 2));
    }

    res.json({ success: true });
});

// ------------------ PING ------------------
app.get("/ping", (req, res) => {
    if (!isAllowed(req)) {
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Device not allowed" });
    }
    res.send("OK");
});

// ------------------ EXTRACT ------------------
app.get("/extract", async (req, res) => {
    if (!isAllowed(req)) {
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
