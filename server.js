const express = require("express");
const puppeteer = require("puppeteer");
const cors = require('cors');
const fs = require("fs");


// --------------------- DYNAMIC DEVICE CHECK ---------------------

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

    const allowedDevices = loadAllowedDevices(); // read every request
    return allowedDevices.includes(deviceId);
}
// ---------------------------------------------------------------


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/ping", (req, res) => {
  if (!isAllowed(req)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Device not allowed" });
  }
  res.send("OK"); // tiny response, nothing heavy
});



app.get("/extract", async (req, res) => {

	if (!isAllowed(req)) {
        return res.status(403).json({
            error: "UNAUTHORIZED",
            message: "Device not allowed"
        });
    }
	

    const classUrl = req.query.url;

    if (!classUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
    }

    try {
        console.log("STEP 1: Launching browser...");
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox", 
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage", // Highly recommended for Render
                "--disable-gpu"
            ]
        });

        console.log("STEP 2: Opening new page...");
        const page = await browser.newPage();
        
        // --- ADDED TIMEOUTS HERE (90 Seconds) ---
        await page.setDefaultNavigationTimeout(90000); 
        await page.setDefaultTimeout(90000); 

        console.log("STEP 3: Setting cookies...");
        const cookies = JSON.parse(process.env.COOKIES_JSON);
        await page.setCookie(...cookies);

        console.log("STEP 4: Going to class URL...");
        // Changed to 'domcontentloaded' for better reliability on slow connections
        await page.goto(classUrl, { 
            waitUntil: "domcontentloaded", 
            timeout: 90000 
        });

        console.log("STEP 5: Waiting for YouTube iframe...");
        
        await page.waitForFunction(() => {
            const iframe = document.querySelector("iframe");
            return iframe && iframe.src && iframe.src.includes("youtube");
        }, { timeout: 90000 });
        
        console.log("STEP 6: Extracting iframe src...");
        
        const iframeSrc = await page.evaluate(() => {
            const iframe = document.querySelector("iframe");
            return iframe ? iframe.src : null;
        });

        console.log("STEP 7: Iframe src =", iframeSrc);

        await browser.close();

        if (!iframeSrc) {
            return res.status(404).json({ error: "No iframe found" });
        }

        let url = iframeSrc;
        if (url.includes("/embed/")) {
            const id = url.split("/embed/")[1].split("?")[0];
            url = "https://www.youtube.com/watch?v=" + id;
        }

        res.json({ youtube: url });

    } catch (err) {
        console.error("ERROR OCCURRED:", err);
        // Important: Close browser even if it fails to prevent memory leaks
        if (typeof browser !== 'undefined') await browser.close();
        res.status(500).json({ error: "Something went wrong", details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
