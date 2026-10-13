const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error(e.message));
    await page.setViewport({ width: 1200, height: 1000 });
    await page.setContent('<div id="calendar"></div><input id="editable" value="test">');
    await page.addStyleTag({ path: path.resolve('public/css/style.css') });
    await page.addScriptTag({ path: path.resolve('public/js/interaction-guards.js') });
    for (const name of ['core','daygrid','timegrid','interaction']) await page.addScriptTag({path:path.resolve(`node_modules/@fullcalendar/${name}/index.global.js`)});
    await page.addScriptTag({content:fs.readFileSync('public/js/calendrier.js','utf8').replace(/^export /gm,'')});
    await page.evaluate(() => {
      window.drops=[];
      window.cal=initialiserCalendrier(document.getElementById('calendar'),{
        onEventDrop:info=>{window.drops.push(info.event.start.toISOString());window.source.date=info.event.start.toISOString().slice(0,10);window.source.heure_debut=info.event.start.toISOString().slice(11,16);window.source.heure_fin=info.event.end.toISOString().slice(11,16);}, canDragSeance:()=>true,
        onDatesSet:()=>{if(window.cal && window.source)mettreAJourEvenements(window.cal,[window.source]);},
      });
      window.cal.gotoDate('2034-06-05');
      window.source={id:1,etudiant:'Test',date:'2034-06-05',heure_debut:'10:00',heure_fin:'11:00',statut_seance:'planifiee'};
      mettreAJourEvenements(window.cal,[window.source]);
    });
    const start=await page.$eval('.fc-event-draggable',el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+10};});
    const edge=await page.$eval('.fc-timegrid-body',el=>{const r=el.getBoundingClientRect();return{x:r.right-10,y:r.top+150};});
    await page.mouse.move(start.x,start.y); await page.mouse.down();
    await page.mouse.move(edge.x,edge.y,{steps:15});
    await page.waitForFunction(()=>window.cal.view.currentStart.toISOString().startsWith('2034-06-12'));
    const target=await page.evaluate(()=>{const r=document.querySelector('.fc-timegrid-col[data-date="2034-06-13"]').getBoundingClientRect(); const t=document.querySelector('.fc-timegrid-slot[data-time="12:00:00"]').getBoundingClientRect();return{x:r.x+r.width/2,y:t.y+10};});
    await page.mouse.move(target.x,target.y,{steps:15}); await page.mouse.up();
    await page.waitForFunction(()=>window.drops.length===1);
    assert.ok((await page.evaluate(()=>window.drops[0])).startsWith('2034-06-13T12:00'));
    const retour=await page.$eval('.fc-event-draggable',el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+10};});
    const gauche=await page.$eval('.fc-timegrid-body',el=>{const r=el.getBoundingClientRect();return{x:r.left+10,y:r.top+150};});
    await page.mouse.move(retour.x,retour.y); await page.mouse.down();
    await page.mouse.move(gauche.x,gauche.y,{steps:15});
    await page.waitForFunction(()=>window.cal.view.currentStart.toISOString().startsWith('2034-06-05'));
    const cibleRetour=await page.evaluate(()=>{const r=document.querySelector('.fc-timegrid-col[data-date="2034-06-06"]').getBoundingClientRect(); const t=document.querySelector('.fc-timegrid-slot[data-time="12:00:00"]').getBoundingClientRect();return{x:r.x+r.width/2,y:t.y+10};});
    await page.mouse.move(cibleRetour.x,cibleRetour.y,{steps:15}); await page.mouse.up();
    await page.waitForFunction(()=>window.drops.length===2);
    assert.ok((await page.evaluate(()=>window.drops[1])).startsWith('2034-06-06T12:00'));
    await page.setViewport({width:375,height:1000});
    await page.waitForFunction(()=>document.querySelector('#calendar[data-calendar-mobile="true"]'));
    const touch=await page.createCDPSession();
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    const debutTactile=await page.$eval('.fc-event-draggable',el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+10};});
    const bordTactile=await page.$eval('.fc-timegrid-body',el=>{const r=el.getBoundingClientRect();return{x:r.right-8,y:r.top+150};});
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[debutTactile]});
    await page.waitForFunction(()=>document.querySelector('.fc-event-mirror'));
    for(let i=1;i<=15;i++) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:debutTactile.x+(bordTactile.x-debutTactile.x)*i/15,y:debutTactile.y+(bordTactile.y-debutTactile.y)*i/15}]});
    await page.waitForFunction(()=>window.cal.view.currentStart.toISOString().startsWith('2034-06-12'));
    const cibleTactile=await page.evaluate(()=>{const r=document.querySelector('.fc-timegrid-col[data-date="2034-06-13"]').getBoundingClientRect(); const t=document.querySelector('.fc-timegrid-slot[data-time="12:00:00"]').getBoundingClientRect();return{x:r.x+r.width/2,y:t.y+10};});
    for(let i=1;i<=15;i++) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bordTactile.x+(cibleTactile.x-bordTactile.x)*i/15,y:bordTactile.y+(cibleTactile.y-bordTactile.y)*i/15}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>window.drops.length===3);
    assert.ok((await page.evaluate(()=>window.drops[2])).startsWith('2034-06-13T12:00'));
    const protections=await page.evaluate(()=>{
      const bloc=document.getElementById('calendar'), champ=document.getElementById('editable');
      return {bloc:getComputedStyle(bloc).userSelect,champ:getComputedStyle(champ).userSelect,
        menu:bloc.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})),
        copie:bloc.dispatchEvent(new Event('copy',{bubbles:true,cancelable:true})),
        collage:champ.dispatchEvent(new Event('paste',{bubbles:true,cancelable:true}))};
    });
    assert.deepEqual(protections,{bloc:'none',champ:'text',menu:false,copie:false,collage:true});
    console.log('calendar week drag browser test: PASS');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
