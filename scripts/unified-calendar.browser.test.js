const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, hasTouch: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const html = ejs.render(fs.readFileSync("views/index.ejs", "utf8"), {
      user: {}, loginUsername: "", loginError: "",
    }).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<link[^>]*>/g, "");
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync("public/css/style.css", "utf8").replace(/^\uFEFF/, "") });
    for (const name of ["core", "daygrid", "timegrid", "interaction"]) {
      await page.addScriptTag({ path: path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`) });
    }
    for (const file of ["calendrier", "seance-context-menu"]) {
      await page.addScriptTag({ content: fs.readFileSync(`public/js/${file}.js`, "utf8").replace(/^export /gm, "") });
    }
    const ui = fs.readFileSync("public/js/ui.js", "utf8")
      .replace(/^import[\s\S]*?from "[^"\n]+";\r?\n/gm, "")
      .replace('document?.addEventListener("DOMContentLoaded", initialiserApplication);', "");
    await page.addScriptTag({ content: `(function() { ${ui}
      window.testUI = { etat, elements, afficherSectionApplication, rendreFiltreCalendrierCentral, synchroniserNavigationSecondaire, mettreAJourNavigationProtegee, mettreAJourVueAujourdhui };
      window.calls = [];
      window.testUI.ouvrirCreationIndisponibilite = ouvrirFormulaireCreationIndisponibiliteDepuisCalendrier;
      ouvrirFormulaireCreation = () => calls.push("seance");
      ouvrirDetailSeance = () => calls.push("detail");
      ouvrirFormulaireCreationIndisponibiliteDepuisCalendrier = () => calls.push("indisponibilite");
      demarrerHorlogeCalendriers = () => {};
      gererDeconnexion = () => calls.push("logout");
      attacherEcouteurs();
    })();` });
    await page.evaluate(() => {
      const { etat } = testUI;
      etat.utilisateur = { id: 1, nom: "Handler", scope: { roles: ["handler", "professeur"] } };
      etat.equipe = [{ id: 2, nom: "Professeur", acces_active: 1 }];
      testUI.mettreAJourNavigationProtegee();
      document.getElementById("current-user-name").textContent = "Handler";
      document.getElementById("current-user-public-id").textContent = "ID : HD-001";
      etat.seances = [
        { id: 1, handler_id: 1, intervenant_id: 1, date: "2034-06-05", heure_debut: "10:00", heure_fin: "11:00", etudiant: "Personnel", statut_seance: "planifiee" },
        { id: 2, handler_id: 1, intervenant_id: 2, date: "2034-06-05", heure_debut: "12:00", heure_fin: "13:00", etudiant: "Equipe", statut_seance: "planifiee" },
        { id: 3, handler_id: 3, intervenant_id: 1, date: "2034-06-05", heure_debut: "14:00", heure_fin: "15:00", etudiant: "Externe", statut_seance: "planifiee" },
      ];
      etat.indisponibilites = [
        { id: 10, intervenant_id: 1, date: "2034-06-05", heure_debut: "08:00", heure_fin: "09:00" },
        { id: 11, intervenant_id: 2, date: "2034-06-05", heure_debut: "08:00", heure_fin: "09:00" },
      ];
      testUI.afficherSectionApplication("dashboard");
      testUI.mettreAJourVueAujourdhui();
      etat.calendrier.gotoDate("2034-06-05");
      window.firstCalendar = etat.calendrier;
    });
    assert.equal(await page.evaluate(() => testUI.etat.calendrier.getOption('selectable')), false,
      'The first render already disables blue range selection, before any mode switch');
    assert.equal(await page.evaluate(() => testUI.etat.calendrier.getOption('selectAllow')()), false,
      'Session mode also rejects range highlights defensively');
    await page.evaluate(() => {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
      window.originalSessions = testUI.etat.seances;
      testUI.etat.seances = originalSessions.map(seance => ({ ...seance, date }));
      testUI.mettreAJourVueAujourdhui();
      testUI.afficherSectionApplication("aujourdhui");
    });
    assert.equal(await page.$eval("#aujourdhui-section", el => el.classList.contains("hidden")), false);
    assert.equal(await page.$("#aujourdhui-section h2"), null, "The Today panel has no duplicate title");
    assert.ok(await page.$("#today-date-label"));
    assert.equal(await page.$eval("#dashboard-section", el => el.classList.contains("hidden")), true);
    assert.equal(await page.$eval("#home-today-tab #today-count", el => el.textContent), "3");
    assert.ok(await page.$("#workspace-menu .sidebar-brand #current-user-name"));
    assert.equal(await page.$("#workspace-menu .sidebar-profile"), null);
    assert.equal(await page.$(".topbar #current-user-name"), null);
    await page.focus("#home-today-tab");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.$eval("#dashboard-section", el => el.classList.contains("hidden")), false);
    assert.equal(await page.$eval("#aujourdhui-section", el => el.classList.contains("hidden")), true);
    await page.click("#home-today-tab");
    await page.evaluate(() => {
      testUI.etat.seances = originalSessions;
      testUI.mettreAJourVueAujourdhui();
    });
    assert.equal(await page.$eval("#today-count", el => el.classList.contains("hidden")), true);
    await page.click("#home-calendar-tab");
    for (const width of [1200, 390, 320]) {
      await page.setViewport({ width, height: 900, hasTouch: true });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.click("#home-today-tab");
      assert.ok(await page.evaluate(() => {
        const date = document.getElementById("today-date-label");
        const heading = date.parentElement;
        return getComputedStyle(date).textAlign === "left" && Math.abs(date.getBoundingClientRect().left - heading.getBoundingClientRect().left) < 1;
      }), `Today date aligns left at ${width}px`);
      await page.click("#home-calendar-tab");
      await page.click('[data-calendar-mode="dashboard"]');
      assert.equal(await page.evaluate(() => testUI.etat.calendrier.getOption('selectable')), false, 'Session mode does not allow dragging an empty range');
      if (width === 1200) {
        await page.$eval('#calendar [data-time="16:00:00"]', el => el.scrollIntoView({ block: 'center' }));
        const points = await page.evaluate(() => {
          const col = document.querySelector('#calendar .fc-timegrid-col[data-date="2034-06-05"]').getBoundingClientRect();
          const start = document.querySelector('#calendar [data-time="16:00:00"]').getBoundingClientRect();
          const end = document.querySelector('#calendar [data-time="18:00:00"]').getBoundingClientRect();
          return { x: col.left + col.width / 2, start: start.top + start.height / 2, end: end.top + end.height / 2 };
        });
        const avant = await page.evaluate(() => calls.length);
        await page.mouse.move(points.x, points.start);
        await page.mouse.down();
        await page.mouse.move(points.x, points.end, { steps: 12 });
        assert.equal(await page.$('#calendar .fc-highlight, #calendar .fc-event-mirror'), null, 'Dragging empty time never draws a blue range');
        await page.mouse.up();
        assert.equal(await page.evaluate(() => calls.length), avant, 'Dragging empty time never starts creation');
      }
      await page.select("#dashboard-person-filter", "2");
      const calendarTop = await page.$eval("#calendar", el => el.getBoundingClientRect().top + scrollY);
      const date = await page.evaluate(() => testUI.etat.calendrier.getDate().toISOString());
      await page.click('[data-calendar-mode="indisponibilites"]');
      assert.equal(await page.evaluate(() => testUI.etat.calendrier.getOption('selectable')), true, 'Availability mode keeps range selection');
      const nextCalendarTop = await page.$eval("#calendar", el => el.getBoundingClientRect().top + scrollY);
      assert.ok(Math.abs(nextCalendarTop - calendarTop) < 1, `Stable calendar position at ${width}px: ${calendarTop} -> ${nextCalendarTop}`);
      assert.equal(await page.$eval("#aujourdhui-section", el => el.classList.contains("hidden")), true);
      if (width <= 720) {
        assert.ok(await page.evaluate(() => {
          const header = document.querySelector(".topbar").getBoundingClientRect();
          const tabs = document.querySelector(".home-view-tabs").getBoundingClientRect();
          const panel = document.querySelector("#dashboard-section .calendar-panel").getBoundingClientRect();
          return Math.abs(tabs.top - header.bottom - 6) < 1 && Math.abs(panel.top - tabs.bottom - 6) < 1;
        }), `The two marked gaps are 6px at ${width}px`);
      }
      assert.ok(await page.$('.calendar-controls-row #dashboard-person-filter'));
      assert.equal(await page.$(".calendar-heading-row h2"), null);
      assert.ok(await page.evaluate(() => {
        const modes = document.querySelector(".calendar-heading-row .calendar-mode-tabs").getBoundingClientRect();
        const filter = document.getElementById("dashboard-person-filter").getBoundingClientRect();
        const row = document.querySelector(".calendar-heading-row").getBoundingClientRect();
        return modes.right <= filter.left && Math.abs(filter.right - row.right) < 1 && Math.abs(modes.left - row.left) < 1 && Math.abs((modes.top + modes.bottom) / 2 - (filter.top + filter.bottom) / 2) < 1;
      }), `Modes and filter share the same row at ${width}px`);
      assert.ok(await page.$('.calendar-duplicate-actions #duplicate-unavailability-week'));
      assert.equal(await page.$('.calendar-controls-row #duplicate-unavailability-week'), null);
      assert.ok(await page.evaluate(() => {
        const calendar = document.getElementById("calendar");
        const button = document.getElementById("duplicate-unavailability-week");
        const link = document.getElementById("dashboard-public-link");
        const rect = button.getBoundingClientRect();
        const grid = calendar.getBoundingClientRect();
        return rect.top >= grid.bottom && Math.abs(rect.right - grid.right) < 1 &&
          Boolean(button.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
      }), "Duplicate is below the calendar, right-aligned, before the public link");
      assert.ok(await page.$eval("#duplicate-unavailability-week", el => el.scrollHeight <= el.clientHeight + 1), `Duplicate label fits at ${width}px`);
      if (width === 390 && process.env.SP_CALENDAR_SCREENSHOT) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: process.env.SP_CALENDAR_SCREENSHOT.replace(/\.png$/, "-home.png") });
      }
      assert.equal(await page.evaluate(() => testUI.etat.calendrier === firstCalendar), true);
      assert.equal(await page.evaluate(() => testUI.etat.calendrier.getDate().toISOString()), date);
      assert.deepEqual(await page.$eval("#dashboard-person-filter", el => [el.disabled, el.selectedOptions[0].textContent]), [true, "Moi"]);
      assert.ok(await page.evaluate(() => {
        const filter = document.getElementById("dashboard-person-filter").getBoundingClientRect();
        const modes = document.querySelector(".calendar-mode-tabs").getBoundingClientRect();
        const row = document.querySelector(".calendar-heading-row").getBoundingClientRect();
        return Math.abs(filter.right - row.right) < 1 && modes.right <= filter.left &&
          Math.abs((modes.top + modes.bottom) / 2 - (filter.top + filter.bottom) / 2) < 1;
      }), "Without a team, the disabled filter stays on the right on the same row");
      assert.deepEqual(await page.$$eval("#calendar [data-seance-id]", els => els.map(el => el.dataset.seanceId).sort()), ["1", "3"]);
      assert.deepEqual(await page.$$eval("#calendar [data-indisponibilite-id]", els => els.map(el => el.dataset.indisponibiliteId)), ["10"]);
      assert.equal(await page.$("#calendar .fc-event-draggable"), null);
      assert.ok(await page.$("#calendar .seance-display-only"));
      await page.$eval('#calendar [data-seance-id="1"]', el => el.click());
      assert.equal(await page.$("#seance-context-menu:not([hidden])"), null);
      await page.$eval('#calendar [data-indisponibilite-id="10"]', el => el.click());
      assert.ok(await page.$("#unavailability-context-menu:not([hidden])"));
      await page.keyboard.press("Escape");
      await page.evaluate(() => testUI.etat.calendrier.trigger("dateClick", { date: new Date("2034-06-05T16:00:00Z"), dateStr: "2034-06-05T16:00:00", allDay: false }));
      assert.equal(await page.evaluate(() => calls.at(-1)), "indisponibilite");
      await page.click('[data-calendar-mode="dashboard"]');
      assert.deepEqual(await page.$eval("#dashboard-person-filter", el => [el.disabled, el.value]), [false, "2"]);
      assert.equal(await page.evaluate(() => testUI.etat.calendrier.getDate().toISOString()), date);
      await page.select("#dashboard-person-filter", "1");
      await page.$eval('#calendar [data-indisponibilite-id="10"]', el => el.click());
      assert.equal(await page.$("#unavailability-context-menu:not([hidden])"), null);
      await page.$eval('#calendar [data-seance-id="1"]', el => el.click());
      assert.ok(await page.$("#seance-context-menu:not([hidden])"));
      await page.keyboard.press("Escape");
      await page.evaluate(() => testUI.etat.calendrier.trigger("dateClick", { date: new Date("2034-06-05T16:00:00Z"), dateStr: "2034-06-05T16:00:00", allDay: false }));
      assert.equal(await page.evaluate(() => calls.at(-1)), "seance");
      await page.click("#nav-more-toggle");
      await page.waitForFunction(() => getComputedStyle(document.getElementById("workspace-menu")).transform === "none");
      assert.equal(await page.$eval("#workspace-menu", el => el.hidden), false);
      assert.ok(await page.$('#workspace-menu [data-section-target="home"]'));
      assert.equal(await page.$('#workspace-menu [data-section-target="aujourdhui"]'), null);
      assert.equal(await page.$('#workspace-menu [data-section-target="dashboard"]'), null);
      assert.ok(await page.$('.sidebar-footer [data-section-target="utilisateur"]'));
      assert.ok(await page.$("#workspace-menu #logout-button"));
      assert.equal(await page.$eval("#workspace-menu", el => getComputedStyle(el).position), "fixed");
      assert.ok(await page.evaluate(() => {
        const name = document.getElementById("current-user-name").getBoundingClientRect();
        const id = document.getElementById("current-user-public-id").getBoundingClientRect();
        const brand = document.querySelector(".sidebar-brand small").getBoundingClientRect();
        const sidebar = document.getElementById("workspace-menu");
        return Math.abs((name.top + name.bottom) / 2 - (id.top + id.bottom) / 2) < 1 && name.top > brand.bottom && sidebar.scrollWidth <= sidebar.clientWidth + 1;
      }), "Name and ID share one line beneath Gestion Superprof without overflow");
      assert.ok(await page.evaluate(() => {
        const brand = getComputedStyle(document.querySelector(".sidebar-brand small"));
        const name = getComputedStyle(document.getElementById("current-user-name"));
        const id = getComputedStyle(document.getElementById("current-user-public-id"));
        const row = getComputedStyle(document.querySelector(".sidebar-identity"));
        return name.fontSize === brand.fontSize && id.fontSize === brand.fontSize && name.fontFamily === brand.fontFamily &&
          name.color === brand.color && id.color === brand.color && Number(name.fontWeight) > Number(id.fontWeight) &&
          row.borderTopWidth === "0px" && id.borderLeftWidth === "0px" && row.backgroundColor === "rgba(0, 0, 0, 0)";
      }), "Identity matches the brand subtitle, without borders; only the name is bolder");
      const footerBottom = await page.$eval("#logout-button", el => el.getBoundingClientRect().bottom);
      assert.ok(footerBottom > 820 && footerBottom <= 900, "Settings and logout stay at the bottom of the sidebar");
      if (width === 390 && process.env.SP_CALENDAR_SCREENSHOT) {
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(243, 244, 246)");
        await page.screenshot({ path: process.env.SP_CALENDAR_SCREENSHOT });
      }
      await page.keyboard.press("Escape");
      assert.equal(await page.$eval("#workspace-menu", el => el.hidden), true);
      await page.evaluate(() => testUI.afficherSectionApplication("monetisation"));
      assert.equal(await page.$eval("#home-section", el => el.classList.contains("hidden")), true);
      await page.click("#nav-more-toggle");
      await page.waitForFunction(() => getComputedStyle(document.getElementById("workspace-menu")).transform === "none");
      await page.click('[data-section-target="home"]');
      assert.equal(await page.$eval("#home-section", el => el.classList.contains("hidden")), false);
      assert.equal(await page.$eval("#aujourdhui-section", el => el.classList.contains("hidden")), true);
      assert.equal(await page.$eval("#dashboard-section", el => el.classList.contains("hidden")), false);
      assert.equal(await page.$eval("#workspace-menu", el => el.hidden), true);
      assert.ok(await page.$eval("#app-view", el => el.scrollWidth <= el.clientWidth + 1), `No overflow at ${width}px`);
    }
    await page.evaluate(() => {
      testUI.etat.calendrier.changeView("dayGridMonth");
      testUI.afficherSectionApplication("indisponibilites");
    });
    assert.equal(await page.evaluate(() => testUI.etat.calendrier.view.type), "dayGridMonth");
    assert.equal(await page.$eval("#duplicate-unavailability-week", el => el.disabled), true);
    await page.waitForSelector("#calendar .calendar-month-heading");
    assert.equal(await page.$eval("#calendar .calendar-month-title", el => el.textContent), "juin 2034");
    assert.ok(await page.$eval("#calendar .calendar-month-heading", el => el.scrollWidth <= el.clientWidth + 1));
    assert.ok(await page.$('#calendar .calendar-month-heading [aria-label="Zoomer : vue semaine"]'));
    assert.equal(await page.$eval("#add-seance-button", el => el.disabled), true);
    assert.equal(await page.$eval("#add-seance-button", el => el.classList.contains("hidden")), true);
    await page.evaluate(() => testUI.afficherSectionApplication("dashboard"));
    assert.equal(await page.evaluate(() => testUI.etat.calendrier.view.type), "dayGridMonth");
    assert.ok(await page.$("#calendar .calendar-month-heading"), "Month heading is shared by Sessions and Unavailability");
    await page.evaluate(() => testUI.etat.calendrier.changeView("timeGridWeek"));
    for (const roles of [["professeur"], ["handler"]]) {
      await page.evaluate(roles => {
        testUI.etat.utilisateur.scope.roles = roles;
        testUI.etat.equipe = [];
        testUI.afficherSectionApplication("dashboard");
      }, roles);
      assert.equal(await page.$eval("#dashboard-person-filter-field", el => el.classList.contains("hidden")), false);
      assert.equal(await page.$eval("#dashboard-person-filter-field", el => el.classList.contains("is-disabled")), true);
      assert.deepEqual(await page.$eval("#dashboard-person-filter", el => [el.disabled, el.selectedOptions[0].textContent]), [true, "Moi"]);
      await page.click('[data-calendar-mode="indisponibilites"]');
      assert.deepEqual(await page.$$eval("#calendar [data-indisponibilite-id]", els => els.map(el => el.dataset.indisponibiliteId)), ["10"]);
    }
    await page.evaluate(() => {
      testUI.etat.equipe = [{ id: 2, nom: "Professeur", acces_active: 1 }];
      testUI.afficherSectionApplication("dashboard");
    });
    assert.deepEqual(await page.$eval("#dashboard-person-filter", el => [el.disabled, el.value]), [false, "global"], "The first active professor enables global view");
    await page.evaluate(() => {
      testUI.etat.equipe = [{ id: 2, nom: "Professeur", acces_active: 0 }];
      testUI.afficherSectionApplication("dashboard");
    });
    assert.deepEqual(await page.$eval("#dashboard-person-filter", el => [el.disabled, el.selectedOptions[0].textContent]), [true, "Moi"], "Inactive professors do not activate the filter");
    await page.setViewport({ width: 390, height: 900, hasTouch: true });
    await page.evaluate(() => testUI.afficherSectionApplication('aujourdhui'));
    await page.$eval('#today-date-label', e => e.scrollIntoView({ block: 'center' }));
    const homeTouch = await page.createCDPSession();
    const swipeHome = async (start, dx, dy = 0) => {
      await homeTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let i = 1; i <= 8; i++) await homeTouch.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: start.x + dx * i / 8, y: start.y + dy * i / 8 }],
      });
      await homeTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const todayPoint = await page.$eval('#today-date-label', e => { const r = e.getBoundingClientRect(); return { x: r.left + 80, y: r.top + r.height / 2 }; });
    await swipeHome(todayPoint, 110);
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'calendrier', 'Rightward swipe opens Calendar from Today');
    const calendarPoint = await page.$eval('#dashboard-section .calendar-panel', e => { const r = e.getBoundingClientRect(); return { x: r.left + 240, y: r.top + 2 }; });
    await swipeHome(calendarPoint, -110);
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'aujourdhui', 'Leftward swipe outside the grid returns to Today');
    await page.evaluate(() => {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
      testUI.etat.seances = originalSessions.map(s => ({ ...s, date }));
      testUI.mettreAJourVueAujourdhui();
    });
    await page.$eval('.today-row', e => e.scrollIntoView({ block: 'center' }));
    const cardPoint = await page.$eval('.today-row', e => { const r = e.getBoundingClientRect(); return { x: r.left + 80, y: r.top + r.height / 2 }; });
    await swipeHome(cardPoint, 110);
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'calendrier', 'Swiping a clickable Today card must also navigate');
    assert.equal(await page.evaluate(() => calls.includes('detail')), false, 'Swiping a card does not open its information');
    await page.evaluate(() => testUI.afficherSectionApplication('aujourdhui'));
    await page.$eval('.today-row', e => e.scrollIntoView({ block: 'center' }));
    const cardLeft = await page.$eval('.today-row', e => { const r = e.getBoundingClientRect(); return { x: r.left + 160, y: r.top + r.height / 2 }; });
    await swipeHome(cardLeft, -110);
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'calendrier', 'The natural leftward tab gesture also works on a Today card');
    await page.$eval('.topbar', e => e.scrollIntoView({ block: 'start' }));
    const topbarPoint = await page.$eval('.topbar', e => { const r = e.getBoundingClientRect(); return { x: r.left + 160, y: r.top + r.height / 2 }; });
    await swipeHome(topbarPoint, -90);
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'aujourdhui', 'Swipe works in the header outside Home and outside the calendar');
    await new Promise(resolve => setTimeout(resolve, 470));
    await page.tap('.today-row');
    assert.equal(await page.evaluate(() => calls.filter(v => v === 'detail').length), 1, 'A short tap still opens information');
    await page.evaluate(() => { testUI.etat.seances = originalSessions; });
    await page.evaluate(() => testUI.afficherSectionApplication('dashboard'));
    assert.equal(await page.evaluate(() => {
      const e = new WheelEvent('wheel', { deltaX: -110, deltaY: 0, bubbles: true, cancelable: true });
      document.querySelector('#calendar .fc-timegrid-body').dispatchEvent(e);
      return e.defaultPrevented;
    }), false, 'Home gestures never capture horizontal week navigation inside the grid');
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'calendrier');
    await page.evaluate(() => document.querySelector('#dashboard-section .calendar-panel').dispatchEvent(new WheelEvent('wheel', { deltaX: -110, bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'aujourdhui', 'Trackpad leftward scroll outside the grid returns to Today');
    await page.evaluate(() => document.getElementById('today-date-label').dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'aujourdhui', 'Vertical scrolling does not switch Home views');
    await new Promise(resolve => setTimeout(resolve, 320));
    await page.evaluate(() => document.getElementById('today-date-label').dispatchEvent(new WheelEvent('wheel', { deltaX: 110, bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'calendrier', 'A new trackpad rightward gesture opens Calendar');
    await page.waitForSelector('#calendar[data-calendar-native-ready="true"]');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const weekBeforeSwipe = await page.evaluate(() => testUI.etat.calendrier.view.currentStart.toISOString());
    const gridSwipe = await page.$eval('.calendar-native-scroller', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width * .85, y: r.top + 100, distance: r.width * -.65 }; });
    await swipeHome({ x: gridSwipe.x, y: gridSwipe.y }, gridSwipe.distance);
    await page.waitForFunction(before => testUI.etat.calendrier.view.currentStart.toISOString() !== before, {}, weekBeforeSwipe);
    assert.equal(await page.evaluate(() => testUI.etat.homeVue), 'calendrier', 'Real week swipe stays inside Calendar, even with Home gesture CSS enabled');
    await page.evaluate(() => testUI.afficherSectionApplication('dashboard'));
    await page.evaluate(() => testUI.ouvrirCreationIndisponibilite({ date: "2034-06-05", heureDebut: "15:00", heureFin: "15:30" }));
    assert.ok(await page.$eval("#unavailability-form-panel", element => element.getClientRects().length > 0), "Creation remains available after removing the information card");
    assert.equal(await page.$("#unavailability-detail-created-at"), null);
    assert.deepEqual(errors, []);
    console.log("unified calendar: PASS (PC/mobile, one instance, same week, filter restoration, personal scope, exclusive actions, menu)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
