from playwright.sync_api import sync_playwright
import json, re, time
BASE='http://localhost:4173'; SB='https://example.supabase.co'
UID='11111111-1111-1111-1111-111111111111'
fails=[]
def ck(n,c,x=''):
    print(('PASS' if c else 'FAIL'),n,x)
    if not c: fails.append(n)
state={'deletion':None,'rpc_calls':[],'writes':[],'queries':[]}
profile={'id':'p1','user_id':UID,'role':'producer','buyer_type':None,'full_name':'Jean Mukendi','phone':None,'province':'Kinshasa','city':'Kinshasa','bio':'Maraîcher','avatar_url':None,'is_verified':False,'created_at':'2026-01-15T10:00:00Z','updated_at':'2026-01-15T10:00:00Z'}
def handler(route, request):
    url=request.url; m=request.method; path=url.split('example.supabase.co')[1]
    hdr={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'}
    if m=='OPTIONS': return route.fulfill(status=204, headers=hdr)
    if m in ('POST','PATCH','DELETE') and '/rpc/' not in path and '/auth/' not in path: state['writes'].append((m,path))
    def js(body,status=200,extra=None):
        h=dict(hdr); h['content-type']='application/json'; h.update(extra or {}); route.fulfill(status=status, headers=h, body=json.dumps(body))
    if '/rpc/get_profile_phone' in path: return js('+243812345678')
    if '/rpc/request_account_deletion' in path:
        state['rpc_calls'].append(('request',request.post_data))
        if state['deletion']: return js({'ok':False,'code':'ALREADY_REQUESTED'})
        state['deletion']={'id':'d1','status':'requested','created_at':'2026-09-29T08:00:00Z','active_orders_count':2}; return js({'ok':True,'id':'d1','active_orders':2})
    if '/rpc/cancel_account_deletion' in path:
        state['rpc_calls'].append(('cancel',None)); state['deletion']=None; return js({'ok':True})
    if '/rest/v1/profiles' in path:
        return js(profile)
    if '/rest/v1/account_deletion_requests' in path:
        state['queries'].append(path)
        return js([state['deletion']] if state['deletion'] and 'status=in' in path else ([] if 'status=in' in path else []))
    if '/rest/v1/orders' in path and m=='HEAD':
        return route.fulfill(status=200, headers={**hdr,'content-range':'0-0/2','content-type':'application/json'}, body='')
    if '/rest/v1/orders' in path:
        state['queries'].append(path); return js([{'id':'o1','buyer_id':UID,'producer_id':'x','status':'pending','total_amount':10}])
    if '/rest/v1/' in path:
        state['queries'].append(path); return js([])
    if '/auth/v1/' in path: return js({'user':{'id':UID,'email':'jean@example.cd'}})
    return js({})
with sync_playwright() as p:
    b=p.chromium.launch()
    for vw in (390,1280):
        state.update({'deletion':None,'rpc_calls':[],'writes':[],'queries':[]})
        ctx=b.new_context(viewport={'width':vw,'height':844}, accept_downloads=True)
        ctx.add_init_script("""
          localStorage.setItem('agriflow_consent', JSON.stringify({version:1,decidedAt:'2026-09-29T00:00:00Z',preferences:true,analytics:false}));
          localStorage.setItem('sb-example-auth-token', JSON.stringify({access_token:'aaa.bbb.ccc',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+7200,expires_in:7200,token_type:'bearer',user:{id:'%s',aud:'authenticated',email:'jean@example.cd',app_metadata:{},user_metadata:{},created_at:'2026-01-15T10:00:00Z'}}));
        """ % UID)
        ctx.route(re.compile(r'https://example\.supabase\.co/.*'), handler)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE+'/profile#confidentialite'); pg.wait_for_timeout(1500)
        sec=pg.locator('#confidentialite')
        ck(f'[{vw}] section visible', sec.is_visible())
        ck(f'[{vw}] title', sec.get_by_role('heading',name='Mes données et ma confidentialité').is_visible())
        txt=sec.inner_text()
        ck(f'[{vw}] shows profile info (name, email, phone, city)', all(x in txt for x in ['Jean Mukendi','jean@example.cd','+243812345678','Kinshasa']))
        ck(f'[{vw}] hash scrolls to section', pg.evaluate("document.getElementById('confidentialite').getBoundingClientRect().top")<300, str(pg.evaluate("document.getElementById('confidentialite').getBoundingClientRect().top")))
        ov=pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth"); ck(f'[{vw}] no horizontal overflow', ov<=0, str(ov))
        # cookie prefs link
        sec.get_by_role('button',name='Gérer mes préférences de cookies').click(); pg.wait_for_timeout(200)
        ck(f'[{vw}] cookie prefs modal opens from account', pg.get_by_role('dialog',name='Préférences de confidentialité').is_visible())
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        # export
        with pg.expect_download() as dl: sec.get_by_role('button',name='Télécharger mes données (JSON)').click()
        d=dl.value; path=d.path(); data=json.load(open(path))
        ck(f'[{vw}] export downloads json', d.suggested_filename.startswith('agriflow-mes-donnees-') and d.suggested_filename.endswith('.json'), d.suggested_filename)
        ck(f'[{vw}] export has profile+account+orders', data['account']['email']=='jean@example.cd' and data['profile']['full_name']=='Jean Mukendi' and len(data['orders'])==1)
        blob=json.dumps(data)
        ck(f'[{vw}] export excludes secrets', not any(k in blob for k in ['checkout_url','access_token','refresh_token','idempotency_key','metadata']))
        # payments query restricted columns & filtered by user
        pq=[q for q in state['queries'] if '/rest/v1/payments' in q]
        ck(f'[{vw}] payments query filtered on own user_id, explicit columns', pq and 'user_id=eq.'+UID in pq[0] and 'checkout_url' not in pq[0], pq[0][:120] if pq else '')
        ck(f'[{vw}] every export query scoped (user_id / participant / order ids)', all(('user_id=eq.' in q) or ('buyer_id' in q) or ('sender_id' in q) or ('reviewer_id' in q) or ('order_id=in' in q) for q in state['queries'] if '/rest/v1/' in q and 'account_deletion' not in q), '')
        ck(f'[{vw}] export made NO write', not state['writes'], str(state['writes']))
        # delete flow
        sec.get_by_role('button',name='Demander la suppression de mon compte').click(); pg.wait_for_timeout(500)
        dlg=pg.get_by_role('alertdialog')
        ck(f'[{vw}] confirm dialog shown', dlg.is_visible())
        ck(f'[{vw}] exact warning text', 'La suppression de votre compte peut entraîner la perte de certaines données associées. Cette action doit être confirmée.' in dlg.inner_text())
        ck(f'[{vw}] active orders warning (2)', '2 commandes en cours' in dlg.inner_text())
        confirm=dlg.get_by_role('button',name='Confirmer la demande')
        ck(f'[{vw}] confirm disabled until checkbox', confirm.is_disabled())
        ck(f'[{vw}] default focus on Cancel (safe)', pg.evaluate("document.activeElement.textContent.trim()")=='Annuler')
        # cancel path: nothing sent
        dlg.get_by_role('button',name='Annuler').click(); pg.wait_for_timeout(200)
        ck(f'[{vw}] cancel: no RPC call, dialog closed', not state['rpc_calls'] and not pg.get_by_role('alertdialog').is_visible())
        # escape path
        sec.get_by_role('button',name='Demander la suppression de mon compte').click(); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        ck(f'[{vw}] escape closes, no RPC', not pg.get_by_role('alertdialog').is_visible() and not state['rpc_calls'])
        # confirm path
        sec.get_by_role('button',name='Demander la suppression de mon compte').click(); pg.wait_for_timeout(400)
        dlg=pg.get_by_role('alertdialog'); dlg.get_by_label('Motif (facultatif)').fill('Je ne vends plus'); dlg.get_by_role('checkbox').check()
        ck(f'[{vw}] confirm enabled after checkbox', dlg.get_by_role('button',name='Confirmer la demande').is_enabled())
        pg.screenshot(path=f'/tmp/shots/delete_dialog_{vw}.png')
        dlg.get_by_role('button',name='Confirmer la demande').click(); pg.wait_for_timeout(700)
        ck(f'[{vw}] RPC request_account_deletion called with reason', state['rpc_calls'] and state['rpc_calls'][0][0]=='request' and 'Je ne vends plus' in (state['rpc_calls'][0][1] or ''), str(state['rpc_calls']))
        ck(f'[{vw}] NO direct delete/write on any table', not state['writes'], str(state['writes']))
        ck(f'[{vw}] pending status shown, nothing deleted', 'Aucune donnée n\'a été supprimée' in sec.inner_text() and 'en attente d\'examen' in sec.inner_text())
        ck(f'[{vw}] request button gone (no duplicate)', sec.get_by_role('button',name='Demander la suppression de mon compte').count()==0)
        pg.screenshot(path=f'/tmp/shots/account_privacy_{vw}.png', full_page=True)
        # reload persists
        pg.reload(); pg.wait_for_timeout(1300)
        ck(f'[{vw}] status persists after reload', 'en attente d\'examen' in pg.locator('#confidentialite').inner_text())
        pg.locator('#confidentialite').get_by_role('button',name='Annuler ma demande').click(); pg.wait_for_timeout(600)
        ck(f'[{vw}] cancel request restores button', pg.locator('#confidentialite').get_by_role('button',name='Demander la suppression de mon compte').is_visible() and state['rpc_calls'][-1][0]=='cancel')
        ck(f'[{vw}] no JS errors', not errs, str(errs))
        ctx.close()
    # unauthenticated: section absent, redirected to login
    ctx=b.new_context(viewport={'width':390,'height':800}); ctx.route(re.compile(r'https://example\.supabase\.co/.*'), handler)
    pg=ctx.new_page(); pg.goto(BASE+'/profile'); pg.wait_for_timeout(1000)
    ck('logged-out /profile redirects to /login, no privacy section', pg.url.endswith('/login') and pg.locator('#confidentialite').count()==0, pg.url)
    b.close()
print('\nFAILED:',fails)
