from playwright.sync_api import sync_playwright
BASE='http://localhost:4173'
PAGES={'/confidentialite':'Politique de confidentialité | AgriFlow RDC','/conditions':"Conditions d'utilisation | AgriFlow RDC",'/cookies':'Politique de cookies | AgriFlow RDC','/remboursement':'Politique de remboursement | AgriFlow RDC','/confiance':'Centre de confiance | AgriFlow RDC','/contact':'Contact | AgriFlow RDC'}
WIDTHS=[360,390,414,768,1024,1280,1440]
fails=[]
def ck(n,c,x=''):
    print(('PASS' if c else 'FAIL'),n,x)
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch()
    errs=[]
    for w in WIDTHS:
        ctx=b.new_context(viewport={'width':w,'height':800}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        # accept consent first so banner doesn't overlap
        pg.goto(BASE+'/'); pg.wait_for_timeout(400); pg.get_by_role('button',name='Tout accepter').click()
        for path,title in PAGES.items():
            pg.goto(BASE+path); pg.wait_for_timeout(600)
            pg.add_style_tag(content="*{font-family:'Liberation Sans',Arial,sans-serif !important}"); pg.wait_for_timeout(150)
            ov=pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            ck(f'{w}px {path} no horizontal overflow (page)', ov<=0, f'overflow={ov}')
            pg.reload(); pg.wait_for_timeout(500)
            ovc=pg.evaluate("Math.max(...['main','footer'].map(s=>{const e=document.querySelector(s);return e.scrollWidth-e.clientWidth}))")
            ck(f'{w}px {path} content+footer no overflow (real fallback font)', ovc<=0, f'overflow={ovc}')
            if w==360: ck(f'{path} title', pg.title()==title, pg.title())
            h1=pg.locator('h1').count(); ck(f'{w}px {path} single h1', h1==1)
        if w in (360,1440):
            pg.goto(BASE+'/confidentialite'); pg.wait_for_timeout(500)
            pg.screenshot(path=f'/tmp/shots/privacy_{w}.png')
            pg.screenshot(path=f'/tmp/shots/privacy_full_{w}.png', full_page=True)
            pg.goto(BASE+'/remboursement'); pg.wait_for_timeout(400); pg.screenshot(path=f'/tmp/shots/refund_{w}.png', full_page=True)
            pg.goto(BASE+'/confiance'); pg.wait_for_timeout(400); pg.screenshot(path=f'/tmp/shots/trust_{w}.png', full_page=True)
            pg.goto(BASE+'/cookies'); pg.wait_for_timeout(400); pg.screenshot(path=f'/tmp/shots/cookies_{w}.png', full_page=True)
        ctx.close()
    # footer flow + navigation from home
    ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page(); pg.goto(BASE+'/'); pg.wait_for_timeout(400); pg.get_by_role('button',name='Tout accepter').click()
    for label,path in [('Politique de confidentialité','/confidentialite'),("Conditions d'utilisation",'/conditions'),('Politique de cookies','/cookies'),('Politique de remboursement','/remboursement'),('Centre de confiance','/confiance'),('Protection des données','/confidentialite')]:
        pg.goto(BASE+'/'); pg.wait_for_timeout(300)
        l=pg.locator('footer').get_by_role('link',name=label,exact=True); l.scroll_into_view_if_needed(); box=l.bounding_box()
        ck(f'footer link "{label}" tap>=36', box and box['height']>=36, str(box and box['height']))
        l.click(); pg.wait_for_timeout(500); ck(f'footer "{label}" -> {path}', pg.url.endswith(path) or pg.url.split('#')[0].endswith(path), pg.url)
    pg.goto(BASE+'/'); pg.wait_for_timeout(300)
    ck('footer has Contact/Aide/A propos', all(pg.locator('footer').get_by_role('link',name=n,exact=True).count()>=1 for n in ["Centre d'aide",'Contact',"À propos d'AgriFlow"]))
    ck('no social links invented', pg.locator('footer a[href*="facebook"], footer a[href*="twitter"], footer a[href*="linkedin"], footer a[href*="instagram"]').count()==0)
    # mobile TOC
    pg.goto(BASE+'/conditions'); pg.wait_for_timeout(500)
    t=pg.get_by_role('button',name='Sommaire'); ck('mobile TOC button', t.is_visible() and t.get_attribute('aria-expanded')=='false')
    t.click(); ck('mobile TOC expands', t.get_attribute('aria-expanded')=='true')
    pg.locator('#toc-mobile').get_by_role('link',name=__import__('re').compile(r'Remboursement$')).click(); pg.wait_for_timeout(400)
    ck('TOC anchor scrolls to section', pg.evaluate("document.getElementById('remboursement').getBoundingClientRect().top")<250, str(pg.evaluate("document.getElementById('remboursement').getBoundingClientRect().top")))
    ck('TOC closed after click', t.get_attribute('aria-expanded')=='false')
    # card table on mobile visible, real table hidden
    pg.goto(BASE+'/remboursement'); pg.wait_for_timeout(400)
    ck('mobile: table hidden, cards visible', not pg.locator('table').first.is_visible() and pg.locator('ul[aria-label="Cas de remboursement"]').is_visible())
    # deep link hash on load
    pg.goto(BASE+'/confidentialite#securite'); pg.wait_for_timeout(700)
    ck('deep link lands on section', pg.evaluate("document.getElementById('securite').getBoundingClientRect().top")<250)
    ctx.close()
    # desktop
    ctx=b.new_context(viewport={'width':1280,'height':800}); pg=ctx.new_page(); pg.goto(BASE+'/'); pg.wait_for_timeout(300); pg.get_by_role('button',name='Tout accepter').click()
    pg.goto(BASE+'/confidentialite'); pg.wait_for_timeout(500)
    aside=pg.locator('aside nav'); ck('desktop sidebar TOC visible', aside.is_visible())
    ck('desktop mobile-bar hidden', not pg.get_by_role('button',name='Sommaire').is_visible())
    pg.evaluate("window.scrollTo(0, document.getElementById('cookies').offsetTop-100)"); pg.wait_for_timeout(500)
    ck('sidebar sticky stays in view after scroll', aside.bounding_box()['y']>=0 and aside.bounding_box()['y']<200, str(aside.bounding_box()))
    ck('active section highlighted', pg.locator('aside nav a[aria-current="location"]').count()==1, pg.locator('aside nav a[aria-current="location"]').inner_text() if pg.locator('aside nav a[aria-current="location"]').count() else '')
    ck('15 sections in privacy', pg.locator('article > div > section').count()==15, str(pg.locator('article > div > section').count()))
    pg2=pg; pg2.goto(BASE+'/conditions'); pg2.wait_for_timeout(400); ck('19 sections in conditions', pg2.locator('article > div > section').count()==19, str(pg2.locator('article > div > section').count()))
    # back button
    pg.goto(BASE+'/'); pg.get_by_role('link',name='Politique de confidentialité',exact=True).first.click(); pg.wait_for_timeout(400)
    pg.get_by_role('button',name='Retour').click(); pg.wait_for_timeout(400); ck('Back button returns', pg.url.rstrip('/')==BASE)
    pg.goto(BASE+'/cookies'); pg.wait_for_timeout(300); pg.get_by_role('button',name='Retour').click(); pg.wait_for_timeout(400); ck('Back with no history -> home', pg.url.rstrip('/')==BASE)
    # cookies page manage UI
    pg.goto(BASE+'/cookies#gestion'); pg.wait_for_timeout(500)
    sec=pg.locator('#gestion'); sw=sec.get_by_role('switch'); ck('cookies page: 1 switch', sw.count()==1)
    import json
    before=sw.get_attribute('aria-checked')=='true'
    sw.click(); sec.get_by_role('button',name='Enregistrer mes préférences').click(); pg.wait_for_timeout(300)
    ck('cookies page saves the toggled value', json.loads(pg.evaluate("localStorage.getItem('agriflow_consent')"))['preferences'] is (not before))
    ck('saved confirmation shown', sec.get_by_text('Préférences enregistrées').is_visible())
    # dark mode
    pg.locator('button[aria-label="Thème"]:visible').first.click(); pg.wait_for_timeout(300)
    ck('dark class on', pg.evaluate("document.documentElement.classList.contains('dark')"))
    pg.goto(BASE+'/confidentialite'); pg.wait_for_timeout(400); pg.screenshot(path='/tmp/shots/privacy_dark_1280.png')
    pg.goto(BASE+'/confiance'); pg.wait_for_timeout(400); pg.screenshot(path='/tmp/shots/trust_dark_1280.png', full_page=True)
    pg.get_by_role('button',name='Gérer mes cookies').click(); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/shots/modal_dark_1280.png')
    ctx.close(); b.close()
print('\nJS errors:',errs); print('FAILED:',fails)
