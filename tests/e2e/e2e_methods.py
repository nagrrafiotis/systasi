# Στάθμες, όγκος, συντελεστής αξίας, κλείδωμα, ανελκυστήρας, ψήφοι, υπόμνημα (προσομοίωση Supabase).
import asyncio, os, subprocess, sys, time, zipfile, re
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); DIST=os.path.join(HERE,'dist'); OUT=os.environ.get('E2E_OUT',os.path.join(HERE,'out')); os.makedirs(OUT,exist_ok=True)
srv=subprocess.Popen([sys.executable,'-m','http.server','4196','-d',DIST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=[];bad=[]
def check(n,c): (ok if c else bad).append(n); print(('PASS ' if c else 'FAIL ')+n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1400,'height':950},accept_downloads=True); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and 'fonts.g' not in m.text and 'ERR_' not in m.text and errs.append(m.text))
    await pg.goto('http://localhost:4196/'); await pg.wait_for_timeout(400)
    await pg.click('[data-auth=up]'); await pg.fill('#authEmail','m@test.gr'); await pg.fill('#authPass','kodikos123'); await pg.click('#authSubmit'); await pg.wait_for_timeout(700)
    await pg.click('#menuNew summary'); await pg.click('[data-act=new-blank]'); await pg.wait_for_timeout(300)
    await pg.fill('#q-plotArea','332')
    # Στοιχεία έργου: όγκος + αξία ανά όροφο
    await pg.click('a[href="#info"]'); await pg.wait_for_timeout(200)
    await pg.select_option('#calc-x-basis','volume'); await pg.wait_for_timeout(250)
    await pg.select_option('#calc-x-valueMode','floor'); await pg.wait_for_timeout(250)
    await pg.click('a[href="#units"]'); await pg.wait_for_timeout(200)
    ids=[await pg.eval_on_selector('input[data-coll=u][data-field=code]','e=>e.dataset.id')]
    for _ in range(3):
        await pg.click('[data-act=u-add]:not([data-bld])'); await pg.wait_for_timeout(250); ids.append(await pg.evaluate('document.activeElement.dataset.id'))
    data=[('ΚΑΤ',60,'0',3.5),('Α1',80,'1',3),('Β1',80,'2',3),('ΑΠ',10,'-1',2.5)]
    for uid,(code,a,fl,h) in zip(ids,data):
        await pg.fill(f'#u-{uid}-code',code); await pg.fill(f'#u-{uid}-main',str(a)); await pg.fill(f'#u-{uid}-height',str(h)); await pg.locator(f'#u-{uid}-height').blur(); await pg.wait_for_timeout(150)
        await pg.select_option(f'#u-{uid}-floor',fl); await pg.wait_for_timeout(200)
    async def pm(uid): return (await pg.get_attribute(f'#u-{uid}-pmFixed','placeholder'))
    vals=[await pm(u) for u in ids]
    # βάρη: 60·3,5·1 = 210 · 80·3·1,05 = 252 · 80·3·1,10 = 264 · 10·2,5·0,5 = 12.5 → Σ 738.5
    exp=[round(x/738.5*1000,2) for x in (210,252,264,12.5)]
    print('   ‰:',vals,'αναμενόμενα ≈',exp)
    check('όγκος × συντελεστής αξίας ανά όροφο', all(abs(float(v.replace(',','.'))-e)<=0.011 for v,e in zip(vals,exp)))
    # κλείδωμα της αποθήκης
    await pg.fill(f'#u-{ids[3]}-pmFixed','15'); await pg.locator(f'#u-{ids[3]}-pmFixed').blur(); await pg.wait_for_timeout(400)
    vals2=[await pm(u) for u in ids[:3]]; s=sum(float(v.replace(',','.')) for v in vals2)
    check('κλείδωμα αποθήκης 15‰: οι υπόλοιπες κλείνουν στα 985‰', abs(s-985)<1e-6)
    check('το κλειδωμένο πεδίο φαίνεται κλειδωμένο', 'locked' in (await pg.get_attribute(f'#u-{ids[3]}-pmFixed','class')))
    # ανελκυστήρας
    await pg.click('a[href="#common"]'); await pg.wait_for_timeout(200)
    await pg.click('[data-act=g-preset][data-mode=elevator]'); await pg.wait_for_timeout(400)
    gid=await pg.evaluate("[...document.querySelectorAll('select[data-coll=g][data-field=mode]')].find(s=>s.value==='elevator').dataset.id")
    ph=[await pg.get_attribute(f'#gf-{gid}\\|{u}-v','placeholder') for u in ids]
    print('   ανελκυστήρας:',ph)
    check('ανελκυστήρας: ισόγειο 0, όροφοι > 0, άθροισμα 1000', ph[0]=='0,00' and float(ph[1].replace(',','.'))>0 and abs(sum(float(x.replace(',','.')) for x in ph)-1000)<1e-6)
    # υπόμνημα και ψήφοι
    await pg.click('a[href="#info"]'); await pg.wait_for_timeout(200)
    await pg.click('[data-act=std-notes]'); await pg.wait_for_timeout(250)
    notes=await pg.input_value('#info-notes')
    check('τυπικές σημειώσεις: ±2% και μικτός όγκος', '2%' in notes and 'μικτός' in notes)
    await pg.check('input[data-coll=calcb][data-field=votes]'); await pg.wait_for_timeout(300)
    await pg.click('a[href="#tables"]'); await pg.wait_for_timeout(300)
    exp_box=pg.locator('input[data-coll=out][data-field=exp]')
    if not await exp_box.is_checked(): await exp_box.check(); await pg.wait_for_timeout(300)
    paper=await pg.text_content('#paper')
    check('πίνακας αναλογισμού: στήλες ΥΨΟΣ, ΟΓΚΟΣ, ΣΥΝΤ. ΑΞΙΑΣ, ΨΗΦΟΙ', all(x in paper for x in ['ΥΨΟΣ','ΟΓΚΟΣ','ΣΥΝΤ. ΑΞΙΑΣ','ΨΗΦΟΙ']))
    check('πίνακας κατανομής δαπανών και ψήφων', 'ΠΙΝΑΚΑΣ ΚΑΤΑΝΟΜΗΣ ΔΑΠΑΝΩΝ ΚΑΙ ΨΗΦΩΝ' in paper and 'ΔΑΠΑΝΕΣ ΑΝΕΛΚΥΣΤΗΡΑ' in paper)
    check('υπόμνημα κάτω από τον πίνακα', 'Υπόμνημα' in paper and '2%' in paper)
    els=await pg.query_selector_all('#paper .doc')
    await els[0].screenshot(path=OUT+'/m1-main.png'); 
    if len(els)>1: await els[1].screenshot(path=OUT+'/m2-exp.png')
    async with pg.expect_download(timeout=60000) as dl: await pg.click('[data-act=dl-pdf]')
    d=await dl.value; pdf=OUT+'/methods.pdf'; await d.save_as(pdf)
    t=subprocess.run(['pdftotext','-layout',pdf,'-'],capture_output=True,text=True).stdout
    check('PDF: ψήφοι, δαπάνες ανελκυστήρα, υπόμνημα', 'ΨΗΦΟΙ' in t and 'ΑΝΕΛΚΥΣΤΗΡΑ' in t and 'Υπόμνημα' in t and '15,00' in t)
    async with pg.expect_download(timeout=60000) as dl: await pg.click('[data-act=dl-xlsx]')
    d=await dl.value; xl=OUT+'/methods.xlsx'; await d.save_as(xl)
    z=zipfile.ZipFile(xl); names=z.namelist(); wb=z.read('xl/workbook.xml').decode()
    check('Excel: φύλλο «Κατανομή δαπανών»', 'Κατανομή δαπανών' in wb)
    ss=z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in names else ''.join(z.read(n).decode() for n in names if n.startswith('xl/worksheets/'))
    check('Excel: υπόμνημα και ψήφοι', 'Υπόμνημα' in ss and 'ΨΗΦΟΙ' in ss)
    check('χωρίς σφάλματα JavaScript', not errs)
    if errs: print(errs[:5])
    await b.close()
asyncio.run(main()); srv.terminate()
print(f'\n{len(ok)} πέρασαν, {len(bad)} απέτυχαν'); sys.exit(1 if bad else 0)
