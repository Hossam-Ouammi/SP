const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const template = fs.readFileSync("views/index.ejs", "utf8");
    const start = template.lastIndexOf("<div", template.indexOf('id="detail-modal"'));
    const end = template.lastIndexOf("<div", template.indexOf('id="unavailability-detail-modal"'));
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">${template.slice(start, end)}`);
    await page.addStyleTag({ content: fs.readFileSync("public/css/style.css", "utf8").replace(/^\uFEFF/, "") });
    await page.evaluate(() => {
      document.getElementById("detail-modal").classList.remove("hidden");
      document.getElementById("detail-title").textContent = "Informations de la séance";
      for (const [id, text] of Object.entries({ student: "Benjamin Alexandre", parent: "Marie Dupont", subject: "Physique-chimie", account: "Hossam", date: "mercredi 14 octobre 2026", time: "14:30 – 16:00", duration: "1 h 30", trial: "Non", "created-by": "Hossam", "updated-by": "Hossam", "created-at": "14/10/2026 à 10:00", "updated-at": "14/10/2026 à 12:00" })) document.getElementById(`detail-${id}`).textContent = text;
    });
    for (const width of [1200, 375, 320]) {
      await page.setViewport({ width, height: 800 });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector("#detail-modal .modal-panel");
        const student = document.getElementById("detail-student").getBoundingClientRect();
        const parent = document.getElementById("detail-parent").getBoundingClientRect();
        return { width: panel.getBoundingClientRect().width, height: panel.getBoundingClientRect().height,
          overflow: panel.scrollWidth > panel.clientWidth + 1, sameRow: Math.abs(student.top - parent.top) < 1,
          auditClosed: !document.querySelector(".session-detail-audit").open };
      });
      assert.ok(layout.width <= Math.min(width, 560));
      assert.ok(layout.height < 560, `Compact height at ${width}: ${layout.height}`);
      assert.equal(layout.overflow, false);
      assert.equal(layout.sameRow, true, "Student and parent share the same row");
      assert.equal(layout.auditClosed, true);
      await page.click(".session-detail-audit summary");
      assert.ok(await page.$eval("#detail-created-at", el => el.getClientRects().length > 0));
      await page.click(".session-detail-audit summary");
    }
    await page.screenshot({ path: path.join(require("node:os").tmpdir(), "sp-session-details-compact.png") });
    console.log("compact session details: PASS (PC, 375px, 320px, two-column information, expandable audit, no overflow)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
