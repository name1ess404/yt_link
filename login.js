const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
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

    await page.goto("https://acsfutureschool.com/", {
        waitUntil: "networkidle2"
    });

    console.log("Please login manually using the sidebar.");
    console.log("After login is complete and homepage reloads, press ENTER here.");

    await new Promise(resolve => {
        process.stdin.once("data", () => {
            resolve();
        });
    });

    const cookies = await page.cookies();
    fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));

    console.log("Cookies saved successfully!");
    await browser.close();
})();
