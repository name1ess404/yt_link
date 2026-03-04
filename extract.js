const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
    const classUrl = process.argv[2];

    if (!classUrl) {
        console.log("Usage: node extract.js <live-class-url>");
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--start-maximized"
        ]
    });

    const page = await browser.newPage();

    // Load saved cookies
    const cookies = JSON.parse(fs.readFileSync("cookies.json"));
    await page.setCookie(...cookies);

    console.log("Opening live class page...");
    await page.goto(classUrl, {
        waitUntil: "networkidle2"
    });

    // Wait for iframe to appear
    await page.waitForSelector("iframe", { timeout: 15000 });

    const iframeSrc = await page.evaluate(() => {
        const iframe = document.querySelector("iframe");
        return iframe ? iframe.src : null;
    });

    if (!iframeSrc) {
        console.log("No iframe found.");
        await browser.close();
        return;
    }

    let url = iframeSrc;

    if (url.includes("/embed/")) {
        const id = url.split("/embed/")[1].split("?")[0];
        url = "https://www.youtube.com/watch?v=" + id;
    }

    console.log("YouTube Link:");
    console.log(url);

    await browser.close();
})();
