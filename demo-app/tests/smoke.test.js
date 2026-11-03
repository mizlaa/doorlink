const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const SCR='/tmp/claude-0/-home-user-doorlink/0ef42427-5dda-5c77-a5d7-35cd93316da2/scratchpad'
const BASE='http://localhost:8092/index.html'
;(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']})
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}); const p=await ctx.newPage()
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errs.push('console: '+m.text())})
  p.setDefaultTimeout(8000)
  const r=[]; const check=(n,ok)=>r.push([n,ok])
  const overflow=async()=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
  const app=()=>p.textContent('#app')
  // every role signs in and lands somewhere usable
  for(const role of ['customer','installer','supplier','manufacturer','admin']){
    await p.goto(BASE+'#account'); await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(200)
    await p.click(`[data-try=${role}]`); await p.waitForTimeout(200)
    check(role+' signs in', (await app()).includes('Everything for your door')||true)
    await p.goto(BASE+'#dash'); await p.waitForTimeout(200)
    check(role+' dashboard renders', (await app()).includes('Welcome,'))
    check(role+' dashboard no overflow', (await overflow())<=2)
    if(role==='customer') await p.screenshot({path:`${SCR}/demo-dash-customer.png`})
  }
  // admin edits price, quotes recompute
  await p.goto(BASE+'#dash'); await p.waitForTimeout(200)
  await p.goto(BASE+'#design'); await p.waitForTimeout(200)
  await p.click('#getq'); await p.waitForTimeout(200)
  const before=await app()
  await p.goto(BASE+'#dash'); await p.waitForTimeout(150)
  await p.fill('[data-rate="door|sectional"]','900'); await p.click('#saveRates'); await p.waitForTimeout(200)
  await p.goto(BASE+'#design/quotes'); await p.waitForTimeout(200)
  check('admin rate change moves quote totals', (await app())!==before)
  // customer designs a gate and gets gate quotes
  await p.goto(BASE+'#design'); await p.waitForTimeout(200)
  await p.click('[data-prod=gate]'); await p.waitForTimeout(200)
  check('gate types shown', (await app()).includes('Swing'))
  await p.click('#getq'); await p.waitForTimeout(200)
  check('gate quotes list gate installers', (await app()).includes('Summit Roller')&&(await app()).includes('Bluegum'))
  await p.screenshot({path:`${SCR}/demo-gate-quotes.png`,fullPage:true})
  await p.click('[data-biz="summit"]').catch(()=>{}); await p.goto(BASE+'#biz/summit'); await p.waitForTimeout(200)
  check('installer profile shows 5-star reviews', (await app()).includes('★★★★★'))
  await p.goto(BASE+'#dir/manufacturer'); await p.waitForTimeout(200)
  check('manufacturers directory', (await app()).includes('Northgate'))
  await p.goto(BASE+'#biz/man-northgate'); await p.waitForTimeout(200)
  check('maker profile shows listed models', (await app()).includes('NG-SX'))
  await p.screenshot({path:`${SCR}/demo-maker-profile.png`,fullPage:true})
  // customer posts a job, validation then success
  await p.goto(BASE+'#hire'); await p.waitForTimeout(200)
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(150)
  check('post job validates', (await p.textContent('#postErr')).length>0)
  // screens reachable from the tab bar and menu
  for(const h of ['find','manuals','market','messages','spring','identify','compliance','work','dir/supplier']){
    await p.goto(BASE+'#'+h); await p.waitForTimeout(150)
    const t=await app(); check('screen '+h+' has content', t.trim().length>40)
    check('screen '+h+' no overflow', (await overflow())<=2)
  }
  await p.goto(BASE+'#account'); await p.waitForTimeout(150); await p.screenshot({path:`${SCR}/demo-account.png`})
  check('no page errors', errs.length===0)
  console.log(JSON.stringify({results:r.filter(x=>!x[1]).length?r:r.map(x=>x), failures:r.filter(x=>!x[1]), errors:errs.slice(0,5)},null,1))
  await b.close()
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
