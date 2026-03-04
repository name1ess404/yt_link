const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.get("/extract", async (req, res) => {
    const classUrl = req.query.url;

    if (!classUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
    }

    try {
        console.log("STEP 1: Launching browser...");

        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            dumpio: true
        });

        console.log("STEP 2: Opening new page...");
        const page = await browser.newPage();

        console.log("STEP 3: Setting cookies...");
        const cookies = JSON.parse(process.env.COOKIES_JSON);
        await page.setCookie(...cookies);

        console.log("STEP 4: Going to class URL...");
        await page.goto(classUrl, { waitUntil: "networkidle2" });

        console.log("STEP 5: Waiting for iframe...");
        await page.waitForSelector("iframe", { timeout: 60000 });  // 60 seconds

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
        res.status(500).json({ error: "Something went wrong" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
