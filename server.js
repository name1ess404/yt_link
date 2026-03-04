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
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });

        const page = await browser.newPage();

        const cookies = JSON.parse(process.env.COOKIES_JSON);
        await page.setCookie(...cookies);

        await page.goto(classUrl, { waitUntil: "networkidle2" });

        await page.waitForSelector("iframe", { timeout: 15000 });

        const iframeSrc = await page.evaluate(() => {
            const iframe = document.querySelector("iframe");
            return iframe ? iframe.src : null;
        });

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
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
