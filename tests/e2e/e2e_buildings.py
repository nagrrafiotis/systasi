# Ροή «δύο κτίρια σε ένα οικόπεδο» (κάθετη + οριζόντια) με προσομοίωση Supabase.
import asyncio, os, subprocess, sys, time, zipfile, re
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); DIST=os.path.join(HERE,'dist'); OUT=os.environ.get('E2E_OUT',os.path.join(HERE,'out')); os.makedirs(OUT,exist_ok=True)
srv=subprocess.Popen([sys.executable,'-m','http.server','4197','-d',DIST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
ok=[];bad=[]
def check(n,c): (ok if c else bad).append(n); print(('PASS ' if c else 'FAIL ')+n)
async def calc(pg,key):
    if await pg.locator(f'[data-calc="{key}"]').count(): return (await pg.text_content(f'[data-calc="{key}"]') or '').strip()
    el=pg.locator(f'[data-ph="{key}"]').first; v=(await el.input_value()).strip()
    return v or (await el.get_attribute('placeholder') or '').strip()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1400,'height':950},accept_downloads=True); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and 'fonts.g' not in m.text and 'ERR_' not in m.text and errs.append(m.text))
    await pg.goto('http://localhost:4197/'); await pg.wait_for_timeout(400)
    await pg.click('[data-auth=up]'); await pg.fill('#authEmail','k@test.gr'); await pg.fill('#authPass','kodikos123'); await pg.click('#authSubmit'); await pg.wait_for_timeout(700)
    await pg.click('#menuNew summary'); await pg.click('[data-act=new-blank]'); await pg.wait_for_timeout(300)
    await pg.fill('#q-plotArea','1369'); await pg.select_option('#q-regime','kathoriz'); await pg.wait_for_timeout(300)
    await pg.click('[data-act=b-add]'); await pg.wait_for_timeout(300); await pg.click('[data-act=b-add]'); await pg.wait_for_timeout(300)
    bids=await pg.eval_on_selector_all('[data-act=u-add][data-bld]','els=>els.map(e=>e.dataset.bld)')
    check('δύο κτίρια με κουμπί «+ Ιδιοκτησία» το καθένα', len(bids)==2)
    first=await pg.eval_on_selector('input[data-coll=u][data-field=code]','e=>e.dataset.id')
    await pg.fill(f'#u-{first}-code','Α1'); await pg.fill(f'#u-{first}-main','95,5')
    async def add(bid,code,area):
        await pg.click(f'[data-act=u-add][data-bld="{bid}"]'); await pg.wait_for_timeout(250)
        uid=await pg.evaluate('document.activeElement.dataset.id'); await pg.fill(f'#u-{uid}-code',code); await pg.fill(f'#u-{uid}-main',area); return uid
    a2=await add(bids[0],'Α2','80'); b1=await add(bids[1],'Β1','120'); b2=await add(bids[1],'Β2','60'); b3=await add(bids[1],'Β3','60')
    await pg.wait_for_timeout(300)
    check('αυτόματα: σύνολο 1000‰', (await pg.text_content('table [data-calc="pmSum"]')).strip()=='1000,00')
    check('κάθε κτίριο έχει 1000‰ εσωτερικά', (await calc(pg,f'b.{bids[0]}.inSum'))=='1000,00' and (await calc(pg,f'b.{bids[1]}.inSum'))=='1000,00')
    # χειροκίνητα ποσοστά κτιρίων
    await pg.select_option('#calc-x-bldMode','manual'); await pg.wait_for_timeout(300)
    await pg.locator(f'#b-{bids[0]}-pmManual').first.fill('446,40'); await pg.locator(f'#b-{bids[1]}-pmManual').first.fill('553,60'); await pg.wait_for_timeout(400)
    check('Α1: 544,16‰ επί κτιρίου', (await calc(pg,f'u.{first}.pmB'))=='544,16')
    check('Α1: 242,91‰ επί οικοπέδου', (await calc(pg,f'u.{first}.pm'))=='242,91')
    check('Β2+Β3: 138,40 + 138,40 και Β1 276,80', [await calc(pg,f'u.{x}.pm') for x in (b1,b2,b3)]==['276,80','138,40','138,40'])
    check('αναλογία οικοπέδου 1369,00', (await calc(pg,'tot.plot'))=='1369,00')
    await pg.screenshot(path=OUT+'/b1-units.png',full_page=True)
    # αποκλειστική χρήση γης στο κτίριο Α
    await pg.click('a[href="#excl"]'); await pg.click('[data-act=x-add][data-kind=garden]'); await pg.wait_for_timeout(250)
    sel=await pg.eval_on_selector('select[data-field=unit]','e=>e.id'); await pg.select_option('#'+sel,'b:'+bids[0]); await pg.wait_for_timeout(250)
    xid=await pg.eval_on_selector('input[data-coll=x][data-field=area]','e=>e.dataset.id'); await pg.fill(f'#x-{xid}-area','300'); await pg.fill(f'#x-{xid}-boundary','(Α1, Α2, Α3, Α4, Α1)'); await pg.wait_for_timeout(300)
    await pg.click('a[href="#units"]'); await pg.wait_for_timeout(200)
    check('η αποκλειστική χρήση φαίνεται στο κτίριο Α', (await calc(pg,f'b.{bids[0]}.land'))=='300,00')
    # κοινόχρηστα κτιρίου
    await pg.click(f'[data-act=b-group][data-id="{bids[1]}"]'); await pg.wait_for_timeout(400)
    txt=await pg.text_content('#main')
    check('κοινόχρηστα κτιρίου Β: δεμένα στο κτίριο', 'Συμμετέχουν όλες οι ιδιοκτησίες του κτιρίου' in txt)
    vals=await pg.eval_on_selector_all('[data-ph^="g."]','els=>els.map(e=>e.value.trim()||e.placeholder)')
    tot=await pg.eval_on_selector_all('[data-calc^="g."][data-calc$=".sum"]','els=>els.map(e=>e.textContent.trim())')
    check('κοινόχρηστα Β: κατανομή 500/250/250', vals[-3:]==['500,00','250,00','250,00'] and tot[-1]=='1000,00')
    # έλεγχοι
    await pg.click('a[href="#checks"]'); await pg.wait_for_timeout(200)
    errsTxt=await pg.eval_on_selector_all('.ck.err','els=>els.map(e=>e.textContent)')
    check('κανένα σφάλμα στους ελέγχους', not errsTxt)
    if errsTxt: print(errsTxt)
    # πίνακες
    await pg.click('a[href="#tables"]'); await pg.wait_for_timeout(400)
    paper=await pg.text_content('#paper')
    check('προεπισκόπηση: στήλη «ΠΟΣΟΣΤΟ ΕΠΙ ΤΗΣ ΚΑΘΕΤΗΣ»', 'ΠΟΣΟΣΤΟ ΕΠΙ ΤΗΣ ΚΑΘΕΤΗΣ ΙΔΙΟΚΤΗΣΙΑΣ' in paper)
    check('περιγραφή κτιρίου ως κάθετης ιδιοκτησίας', 'ΚΤΙΡΙΟ Α: αυτοτελής και ανεξάρτητη κάθετη ιδιοκτησία' in paper and '446,40‰' in paper)
    check('περιγραφή Α1: ‰ επί καθέτου και επί οικοπέδου', '544,16‰ εξ αδιαιρέτου επί της καθέτου ιδιοκτησίας «ΚΤΙΡΙΟ Α» και ποσοστό 242,91‰' in paper)
    el=await pg.query_selector('#paper .doc'); await el.screenshot(path=OUT+'/b2-table.png')
    async with pg.expect_download(timeout=60000) as dl: await pg.click('[data-act=dl-pdf]')
    d=await dl.value; pdf=OUT+'/buildings.pdf'; await d.save_as(pdf)
    t=subprocess.run(['pdftotext','-layout',pdf,'-'],capture_output=True,text=True).stdout
    check('PDF: κτίρια και ποσοστά', 'ΚΤΙΡΙΟ Α' in t and '446,40' in t and '242,91' in t and '1369,00' in t)
    async with pg.expect_download(timeout=60000) as dl: await pg.click('[data-act=dl-xlsx]')
    d=await dl.value; xl=OUT+'/buildings.xlsx'; await d.save_as(xl)
    x=zipfile.ZipFile(xl).read('xl/worksheets/sheet1.xml').decode()
    f=re.findall(r'<f>([^<]+)</f>',x)
    check('Excel: σύνολα μόνο από γραμμές ιδιοκτησιών (όχι κτιρίων)', bool(f) and all(',' in q for q in f))
    print('   τύποι:',f[:3])
    check('χωρίς σφάλματα JavaScript', not errs)
    if errs: print(errs[:5])
    await b.close()
asyncio.run(main()); srv.terminate()
print(f'\n{len(ok)} πέρασαν, {len(bad)} απέτυχαν'); sys.exit(1 if bad else 0)
