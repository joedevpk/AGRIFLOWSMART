from playwright.sync_api import sync_playwright
BASE='http://localhost:4173'
JS="""()=>{
function parse(c){const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}
function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)}
function over(top,bot){const a=top.a;return {r:top.r*a+bot.r*(1-a),g:top.g*a+bot.g*(1-a),b:top.b*a+bot.b*(1-a),a:1}}
function bgOf(el){const stack=[];let e=el;while(e){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0)stack.push(c);if(c&&c.a>=1)break;e=e.parentElement}
 let base={r:255,g:255,b:255,a:1};if(!stack.length||stack[stack.length-1].a<1){const bd=parse(getComputedStyle(document.body).backgroundColor);if(bd&&bd.a>0)base=bd}
 for(let i=stack.length-1;i>=0;i--)base=over(stack[i],base);return base}
const out=[];const seen=new Set();const inGradient=e=>{while(e){if(getComputedStyle(e).backgroundImage!=='none')return true;e=e.parentElement}return false};
document.querySelectorAll('main *, footer *, [role=dialog] *, [role=region] *, header *').forEach(el=>{
 if(!el.childNodes.length)return;if(inGradient(el)||el.closest('header'))return;let has=false;el.childNodes.forEach(n=>{if(n.nodeType===3&&n.textContent.trim().length>1)has=true});if(!has)return;
 const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||el.offsetParent===null&&cs.position!=='fixed')return;
 const r=el.getBoundingClientRect();if(r.width===0||r.height===0)return;
 let fg=parse(cs.color);if(!fg)return;const bg=bgOf(el);fg=over(fg,bg);
 const L1=lum(fg),L2=lum(bg);const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
 const size=parseFloat(cs.fontSize);const bold=parseInt(cs.fontWeight)>=700;const large=size>=24||(size>=18.66&&bold);
 const need=large?3:4.5;
 if(ratio<need){const t=el.textContent.trim().slice(0,45);const k=t;if(!seen.has(k)){seen.add(k);out.push(ratio.toFixed(2)+' (<'+need+') '+el.tagName+' "'+t+'"')}}
});return out}"""
res={}
with sync_playwright() as p:
    b=p.chromium.launch()
    for scheme in ('light','dark'):
        ctx=b.new_context(viewport={'width':1280,'height':900}, color_scheme=scheme); pg=ctx.new_page()
        pg.goto(BASE+'/'); pg.wait_for_timeout(500)
        # banner
        r=pg.evaluate(JS); print(f'[{scheme}] banner+home region issues (only banner):',[x for x in r if 'cookies' in x.lower() or 'Personnaliser' in x or 'accepter' in x.lower()])
        pg.get_by_role('button',name='Personnaliser').click(); pg.wait_for_timeout(300)
        r=pg.evaluate(JS); print(f'[{scheme}] modal issues:',r)
        pg.keyboard.press('Escape'); pg.get_by_role('button',name='Tout accepter').click(); pg.wait_for_timeout(200)
        for path in ['/confidentialite','/conditions','/cookies','/remboursement','/confiance']:
            pg.goto(BASE+path); pg.wait_for_timeout(600)
            pg.add_style_tag(content="*{font-family:'Liberation Sans',Arial,sans-serif !important}")
            r=pg.evaluate(JS); r=[x for x in r]
            print(f'[{scheme}] {path}: {len(r)} issue(s)'); [print('    ',x) for x in r[:8]]
        ctx.close()
    b.close()
