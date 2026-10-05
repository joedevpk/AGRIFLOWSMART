from playwright.sync_api import sync_playwright
import json
BASE='http://localhost:4173'
res=[]
def check(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS' if cond else 'FAIL'), name, extra)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844})
    page=ctx.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE+'/'); page.wait_for_timeout(800)
    banner=page.get_by_role('region', name='Consentement aux cookies')
    check('banner visible on first visit', banner.is_visible())
    acc=page.get_by_role('button', name='Tout accepter'); rej=page.get_by_role('button', name='Refuser les cookies non essentiels'); cus=page.get_by_role('button', name='Personnaliser')
    ba,br=acc.bounding_box(),rej.bounding_box()
    check('accept/reject same size', abs(ba['width']-br['width'])<1 and abs(ba['height']-br['height'])<1, f"{ba['width']}x{ba['height']} vs {br['width']}x{br['height']}")
    check('accept/reject same classes', acc.get_attribute('class')==rej.get_attribute('class'))
    check('touch target >=44', ba['height']>=44 and br['height']>=44)
    page.screenshot(path='/tmp/shots/banner_390.png')
    # nothing stored before choice
    check('no consent/theme stored before choice', page.evaluate("[localStorage.getItem('agriflow_consent'),localStorage.getItem('agriflow_theme'),localStorage.getItem('agriflow_language')]")==[None,None,None])
    # keyboard reachability
    page.keyboard.press('Tab')
    seen=set()
    for _ in range(8):
        t=page.evaluate("document.activeElement && document.activeElement.textContent.trim().slice(0,40)")
        seen.add(t); page.keyboard.press('Tab')
    check('keyboard reaches 3 buttons', all(any(x in s for s in seen) for x in ['Tout accepter','Refuser les cookies non essentiels','Personnaliser']))
    # REFUSE
    rej.click(); page.wait_for_timeout(200)
    check('banner hidden after refuse', not banner.is_visible())
    rec=json.loads(page.evaluate("localStorage.getItem('agriflow_consent')"))
    check('refuse recorded (prefs false)', rec['preferences'] is False and rec['analytics'] is False, str(rec))
    page.set_viewport_size({'width':1440,'height':900}); page.wait_for_timeout(300)
    # toggle theme: not persisted
    page.evaluate("document.documentElement.classList.contains('dark')")
    tt=page.locator('button[aria-label="Thème"]:visible').first
    if tt.count():
        tt.click(); page.wait_for_timeout(200)
    check('theme NOT persisted after refuse', page.evaluate("localStorage.getItem('agriflow_theme')") is None)
    page.reload(); page.wait_for_timeout(600)
    check('banner not shown on return', not page.get_by_role('region', name='Consentement aux cookies').is_visible())
    # reopen via footer, enable preferences, save
    page.get_by_role('button', name='Gestion des cookies').click(); page.wait_for_timeout(200)
    dlg=page.get_by_role('dialog', name='Préférences de confidentialité')
    check('modal opens from footer', dlg.is_visible())
    sw=dlg.get_by_role('switch')
    check('one toggle only (necessary locked, analytics unavailable)', sw.count()==1, str(sw.count()))
    check('preferences switch reflects refuse (off)', sw.first.get_attribute('aria-checked')=='false')
    check('analytics says not used', 'aucun outil de mesure' in dlg.inner_text().lower())
    page.screenshot(path='/tmp/shots/modal_390.png')
    sw.first.click()
    dlg.get_by_role('button', name='Enregistrer mes préférences').click(); page.wait_for_timeout(300)
    rec=json.loads(page.evaluate("localStorage.getItem('agriflow_consent')"))
    check('saved prefs true', rec['preferences'] is True)
    check('modal closed after save', not dlg.is_visible())
    tt=page.locator('button[aria-label="Thème"]:visible').first
    tt.click(); page.wait_for_timeout(300)
    check('theme persisted after accept prefs', page.evaluate("localStorage.getItem('agriflow_theme')") in ('dark','light'), page.evaluate("localStorage.getItem('agriflow_theme')"))
    # withdraw
    page.get_by_role('button', name='Gestion des cookies').click(); page.wait_for_timeout(200)
    dlg=page.get_by_role('dialog', name='Préférences de confidentialité')
    check('switch on when previously accepted', dlg.get_by_role('switch').first.get_attribute('aria-checked')=='true')
    dlg.get_by_role('button', name='Refuser les non essentiels').click(); page.wait_for_timeout(300)
    check('withdraw purges theme+language', page.evaluate("[localStorage.getItem('agriflow_theme'),localStorage.getItem('agriflow_language')]")==[None,None])
    # ESC + focus trap + focus restore
    btn=page.get_by_role('button', name='Gestion des cookies'); btn.click(); page.wait_for_timeout(200)
    for _ in range(15): page.keyboard.press('Tab')
    inside=page.evaluate("!!document.activeElement.closest('[role=dialog]')")
    check('focus trapped in modal', inside)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('escape closes modal', not page.get_by_role('dialog', name='Préférences de confidentialité').is_visible())
    check('focus returned to footer button', page.evaluate("document.activeElement.textContent.trim()")=='Gestion des cookies')
    check('escape kept previous choice', json.loads(page.evaluate("localStorage.getItem('agriflow_consent')"))['preferences'] is False)
    ctx.close()
    # ACCEPT ALL + CUSTOMIZE from banner in fresh context
    ctx=b.new_context(viewport={'width':1280,'height':800}); page=ctx.new_page(); page.goto(BASE+'/'); page.wait_for_timeout(700)
    page.get_by_role('button', name='Personnaliser').click(); page.wait_for_timeout(200)
    dlg=page.get_by_role('dialog', name='Préférences de confidentialité')
    check('customize opens modal, banner hidden', dlg.is_visible() and not page.get_by_role('region', name='Consentement aux cookies').is_visible())
    check('optional starts OFF (no pre-tick)', dlg.get_by_role('switch').first.get_attribute('aria-checked')=='false')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('escape from banner-customize: banner back, no record', page.get_by_role('region', name='Consentement aux cookies').is_visible() and page.evaluate("localStorage.getItem('agriflow_consent')") is None)
    page.get_by_role('button', name='Tout accepter').click(); page.wait_for_timeout(300)
    rec=json.loads(page.evaluate("localStorage.getItem('agriflow_consent')"))
    check('accept all: prefs true, analytics false (none exists)', rec['preferences'] is True and rec['analytics'] is False, str(rec))
    check('no HTTP cookies set', page.evaluate("document.cookie")=='' )
    ctx.close(); b.close()
print('\nJS errors:', errors)
print('FAILED:', [n for n,ok in res if not ok])
