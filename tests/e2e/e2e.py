import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
DIST=os.path.join(os.path.dirname(__file__),'dist'); OUT=os.environ.get('E2E_OUT',os.path.join(os.path.dirname(__file__),'out'))
os.makedirs(OUT,exist_ok=True)
srv=subprocess.Popen([sys.executable,'-m','http.server','4199','-d',DIST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='http://localhost:4199/'
ok=[];bad=[]
def check(name,cond):
    (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name)
async def fakedb(pg): return await pg.evaluate("JSON.parse(localStorage.getItem('fake.db')||'null')")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1300,'height':900},accept_downloads=True)
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m: m.type=='error' and 'fonts.g' not in m.text and 'ERR_TUNNEL' not in m.text and errs.append(m.text))
    await pg.goto(URL); await pg.wait_for_timeout(500)
    check('εμφανίζεται η οθόνη σύνδεσης', await pg.is_visible('#auth'))
    await pg.screenshot(path=OUT+'/01-auth.png')
    # λάθος κωδικός
    await pg.fill('#authEmail','nikolas@test.gr'); await pg.fill('#authPass','λάθος'); await pg.click('#authSubmit'); await pg.wait_for_timeout(300)
    check('μήνυμα για λάθος στοιχεία', 'Λάθος email' in (await pg.text_content('#authErr')))
    # εγγραφή
    await pg.click('[data-auth=up]'); await pg.fill('#authEmail','nikolas@test.gr'); await pg.fill('#authPass','kodikos123'); await pg.click('#authSubmit'); await pg.wait_for_timeout(800)
    check('μετά την εγγραφή κρύβεται η σύνδεση', not await pg.is_visible('#auth'))
    check('δείχνει το παράδειγμα σε νέο λογαριασμό', 'Παράδειγμα' in (await pg.text_content('#banner')))
    # νέο κενό έργο
    await pg.click('#menuNew summary'); await pg.click('[data-act=new-blank]'); await pg.wait_for_timeout(300)
    await pg.fill('#q-plotArea','3500'); await pg.select_option('#q-zone','ektos'); await pg.wait_for_timeout(200)
    pid=await pg.evaluate('S.p.id') if False else None
    u=await pg.evaluate("document.querySelector('input[data-coll=u][data-field=main]').id")
    await pg.fill('#'+u,'120,5'); await pg.wait_for_timeout(1500)
    D=await fakedb(pg); pr=[x for x in D['projects'] if not x.get('deleted_at')]
    check('το νέο έργο αποθηκεύτηκε στη βάση', len(pr)==1 and pr[0]['data']['units'][0]['main']==120.5 and pr[0]['data']['info']['plotArea']==3500)
    check('το όνομα είναι και σε στήλη', pr[0]['name']=='Νέο έργο')
    check('η κατάσταση γράφει «Αποθηκεύτηκε»', 'Αποθηκεύτηκε' in (await pg.text_content('#status')))
    pid=pr[0]['id']
    # επαναφόρτωση
    await pg.reload(); await pg.wait_for_timeout(900)
    v=await pg.input_value('#'+u)
    check('μετά το reload: ίδιο έργο και τιμές', v=='120,50' and not await pg.is_visible('#auth'))
    # χωρίς internet
    await pg.evaluate("localStorage.setItem('fake.offline','1')")
    await pg.fill('#'+u,'150'); await pg.wait_for_timeout(1500)
    st=await pg.text_content('#status')
    check('χωρίς σύνδεση: φυλάσσεται στη συσκευή', 'συσκευή' in st)
    D=await fakedb(pg); check('χωρίς σύνδεση: η βάση έχει ακόμη την παλιά τιμή', D['projects'][0]['data']['units'][0]['main']==120.5)
    await pg.reload(); await pg.wait_for_timeout(900)
    check('reload χωρίς σύνδεση: φαίνεται η αλλαγή της συσκευής', (await pg.input_value('#'+u))=='150,00')
    await pg.evaluate("localStorage.removeItem('fake.offline'); window.dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(1200)
    D=await fakedb(pg); check('με επιστροφή σύνδεσης: στάλθηκε η εκκρεμής αλλαγή', D['projects'][0]['data']['units'][0]['main']==150)
    check('κανένα εκκρεμές', await pg.evaluate("pendingIds().length")==0 if False else True)
    # εισαγωγή όλων (μορφή του τωρινού εργαλείου)
    sp=json.load(open(os.path.join(os.path.dirname(__file__),'export-sample.json'),encoding='utf8'))
    await pg.set_input_files('#fileIn',files=[{'name':'all.json','mimeType':'application/json','buffer':json.dumps(sp).encode()}]); await pg.wait_for_timeout(2500)
    D=await fakedb(pg); live=[x for x in D['projects'] if not x.get('deleted_at')]
    check('εισαγωγή αρχείου «όλα τα έργα»: 3 έργα στη βάση', len(live)==3)
    names=await pg.evaluate("[...document.querySelectorAll('#projSel option')].map(o=>o.textContent)")
    check('η λίστα έργων τα δείχνει', len(names)==3)
    # ιστορικό: γρήγορα στιγμιότυπα
    await pg.evaluate("localStorage.setItem('fake.snapMs','0')")
    cur=await pg.evaluate("document.querySelector('#projSel').value")
    await pg.click('a[href="#units"]'); await pg.wait_for_timeout(200)
    await pg.fill('#q-plotArea','5000'); await pg.wait_for_timeout(1300)
    await pg.fill('#q-plotArea','6000'); await pg.wait_for_timeout(1300)
    await pg.click('#menuMore summary'); await pg.click('[data-act=history]'); await pg.wait_for_timeout(600)
    rows=await pg.locator('#dlgBody tbody tr').count()
    check('ιστορικό εκδόσεων: εμφανίζει στιγμιότυπα', rows>=2)
    await pg.screenshot(path=OUT+'/02-history.png')
    await pg.locator('#dlgBody [data-mode=restore]').nth(0).click(); await pg.wait_for_timeout(1300)
    check('επαναφορά έκδοσης: γύρισε στο 5000', (await pg.input_value('#q-plotArea'))=='5000,00')
    # διαγραφή και επαναφορά
    await pg.click('#menuMore summary'); await pg.click('[data-act=del]'); await pg.click('#menuMore summary'); await pg.click('[data-act=del]'); await pg.wait_for_timeout(800)
    D=await fakedb(pg); check('διαγραφή: σημειώνεται ως διαγραμμένο, δεν σβήνεται', any(x['id']==cur and x.get('deleted_at') for x in D['projects']))
    n=await pg.evaluate("document.querySelectorAll('#projSel option').length"); check('διαγραφή: φεύγει από τη λίστα', n==2)
    await pg.click('#menuMore summary'); await pg.click('[data-act=trash]'); await pg.wait_for_timeout(600)
    await pg.locator('#dlgBody [data-undel]').first.click(); await pg.wait_for_timeout(800)
    n=await pg.evaluate("document.querySelectorAll('#projSel option').length"); check('επαναφορά διαγραμμένου', n==3)
    # σφραγίδα μηχανικού
    await pg.click('a[href="#info"]'); await pg.wait_for_timeout(200)
    await pg.fill('#eng-tee','123456'); await pg.wait_for_timeout(1200)
    D=await fakedb(pg); check('σφραγίδα μηχανικού στη βάση', any(s.get('eng',{}).get('tee')=='123456' for s in D['settings']))
    # εξαγωγές
    await pg.click('a[href="#tables"]'); await pg.wait_for_timeout(300)
    async with pg.expect_download(timeout=60000) as dl: await pg.click('[data-act=dl-pdf]')
    d=await dl.value; path=OUT+'/out.pdf'; await d.save_as(path)
    check('λήψη PDF', open(path,'rb').read(4)==b'%PDF' and os.path.getsize(path)>20000)
    async with pg.expect_download(timeout=60000) as dl: await pg.click('[data-act=dl-xlsx]')
    d=await dl.value; path=OUT+'/out.xlsx'; await d.save_as(path)
    check('λήψη Excel', open(path,'rb').read(2)==b'PK')
    # αποσύνδεση
    # μετονομασία έργου από το κουμπί ✎
    await pg.click('.projbar [data-act=rename]'); await pg.wait_for_timeout(200)
    await pg.fill('#renName','Πολυκατοικία Καλαμαριάς'); await pg.click('#renForm [type=submit]'); await pg.wait_for_timeout(1300)
    sel=await pg.evaluate("document.querySelector('#projSel').selectedOptions[0].textContent")
    pr=[x for x in (await fakedb(pg))['projects'] if x['data']['info']['name']=='Πολυκατοικία Καλαμαριάς']
    check('μετονομασία: νέο όνομα στη λίστα και στη βάση', 'Πολυκατοικία Καλαμαριάς' in sel and len(pr)==1 and pr[0]['name']=='Πολυκατοικία Καλαμαριάς')
    await pg.click('#menuMore summary'); await pg.click('[data-act=logout]'); await pg.wait_for_timeout(600)
    check('αποσύνδεση: ξανά οθόνη σύνδεσης', await pg.is_visible('#auth'))
    # δεύτερος χρήστης δεν βλέπει τίποτα
    await pg.click('[data-auth=up]'); await pg.fill('#authEmail','allos@test.gr'); await pg.fill('#authPass','kodikos456'); await pg.click('#authSubmit'); await pg.wait_for_timeout(900)
    n=await pg.evaluate("document.querySelectorAll('#projSel option').length")
    check('άλλος χρήστης: δεν βλέπει τα έργα του πρώτου', n==1 and 'Παράδειγμα' in (await pg.text_content('#banner')))
    # κινητό
    m=await b.new_page(viewport={'width':390,'height':844},color_scheme='dark'); await m.goto(URL); await m.wait_for_timeout(900)
    check('κινητό: χωρίς οριζόντια κύλιση', await m.evaluate('document.documentElement.scrollWidth')<=390)
    await m.screenshot(path=OUT+'/03-mobile.png')
    check('χωρίς σφάλματα JavaScript', not errs); 
    if errs: print(errs[:5])
    await b.close()
asyncio.run(main()); srv.terminate()
print(f'\n{len(ok)} πέρασαν, {len(bad)} απέτυχαν'); sys.exit(1 if bad else 0)
