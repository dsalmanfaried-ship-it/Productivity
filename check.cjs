/* اختبار غابتي: الاستجابة + تحديث الـ service worker + وجود ملفات الصوت.
   التشغيل: node tests/check.cjs   (من جذر المستودع، ومحتاج: npm i playwright) */
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');

const SRC=process.cwd();
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'ghabaty-'));
const SKIP=new Set(['.git','node_modules','tests','.github']);
(function cp(a,b){fs.mkdirSync(b,{recursive:true});for(const f of fs.readdirSync(a)){if(a===SRC&&SKIP.has(f))continue;const s=path.join(a,f),d=path.join(b,f);fs.statSync(s).isDirectory()?cp(s,d):fs.copyFileSync(s,d)}})(SRC,TMP);

const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(TMP,p);
 if(!f.startsWith(TMP)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('nf')}
 r.writeHead(200,{'content-type':(MIME[path.extname(f)]||'application/octet-stream')+'; charset=utf-8','cache-control':'no-store'});r.end(fs.readFileSync(f))});

const results=[];let failed=0;
const ok=(name,pass,info='')=>{results.push({name,pass});if(!pass)failed++;console.log((pass?'✔ ':'✖ ')+name+(info?'  '+info:''))};
const warn=m=>console.log('⚠ '+m);

const VPS=[['موبايل-صغير',320,568],['موبايل',390,844],['تابلت',768,1024],['كمبيوتر',1280,800],['موبايل-أفقي',844,390]];
const TABS=['focus','forest','pray','stats','shop'];

async function newCtx(b,vp,sw){
 const ctx=await b.newContext({viewport:vp,serviceWorkers:sw});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.route(/gstatic\.com|googleapis\.com|firebase/,r=>r.abort());
 await p.addInitScript(()=>sessionStorage.setItem('forest-gate-skip','1'));
 return{ctx,p};
}

async function responsive(b,base){
 fs.mkdirSync('tests/shots',{recursive:true});
 for(const[n,w,h]of VPS){
  const{ctx,p}=await newCtx(b,{width:w,height:h},'block');
  await p.goto(base+'/index.html');await p.waitForTimeout(500);
  let bad=[];
  for(const t of TABS){
   await p.click(`nav button[data-v=${t}]`);await p.waitForTimeout(120);
   const m=await p.evaluate(()=>({over:document.documentElement.scrollWidth>document.documentElement.clientWidth,
    out:[...document.querySelectorAll('.app *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)}).length}));
   if(m.over||m.out)bad.push(t+(m.over?'(تمدد أفقي)':'(عناصر خارج الشاشة)'));
  }
  await p.click('nav button[data-v=focus]');await p.screenshot({path:`tests/shots/${n}.png`});
  ok(`استجابة ${n} (${w}×${h}) – كل التابات`,!bad.length,bad.join(' '));
  ok(`مفيش أخطاء JS في ${n}`,!p.errs.length,p.errs.join(' | '));
  await ctx.close();
 }
}

async function swUpdate(b,base){
 const{ctx,p}=await newCtx(b,{width:390,height:844},'allow');
 const toasts=()=>p.evaluate(()=>[...document.querySelectorAll('.toast')].map(t=>t.textContent).join('|'));
 const cacheNames=()=>p.evaluate(()=>caches.keys());
 await p.goto(base+'/index.html');
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForTimeout(1500);
 ok('أول تثبيت: مفيش إشعار تحديث',!(await toasts()).includes('تحديث'));
 await p.reload();await p.waitForTimeout(600);
 const c1=await cacheNames();
 ok('الهيكل اتخزن في الكاش',c1.length===1,c1.join(','));
 await ctx.setOffline(true);await p.reload();await p.waitForTimeout(600);
 ok('بيشتغل بدون نت',(await p.evaluate(()=>document.querySelector('#main').children.length))>0);
 await ctx.setOffline(false);
 // نشر نسخة جديدة (على النسخة المؤقتة بس)
 const swF=path.join(TMP,'sw.js'),ixF=path.join(TMP,'index.html');
 const m=fs.readFileSync(swF,'utf8').match(/const CACHE = '([^']+)'/);
 const newName=m[1]+'-test';
 fs.writeFileSync(swF,fs.readFileSync(swF,'utf8').replace(m[1],newName));
 fs.writeFileSync(ixF,fs.readFileSync(ixF,'utf8').replace('<h1>','<h1 data-t="1">'));
 await p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));await p.waitForTimeout(2500);
 ok('ظهر إشعار "فيه تحديث جديد"',(await toasts()).includes('تحديث جديد'),await toasts());
 const c2=await cacheNames();
 ok('الكاش القديم اتمسح والجديد اتعمل',c2.length===1&&c2[0]===newName,c2.join(','));
 await p.reload();await p.waitForTimeout(600);
 ok('بعد التحديث ظهر المحتوى الجديد',await p.evaluate(()=>!!document.querySelector('h1[data-t]')));
 await ctx.setOffline(true);await p.reload();await p.waitForTimeout(600);
 ok('النسخة الجديدة شغالة بدون نت',await p.evaluate(()=>!!document.querySelector('h1[data-t]')));
 ok('مفيش أخطاء JS في اختبار التحديث',!p.errs.length,p.errs.join(' | '));
 await ctx.close();
}

function audioFiles(){
 const html=fs.readFileSync(path.join(SRC,'index.html'),'utf8');
 const urls=[...new Set([...html.matchAll(/audio\/[\w.\-]+\.mp3/g)].map(x=>x[0]))];
 const miss=urls.filter(u=>!fs.existsSync(path.join(SRC,u))&&!fs.existsSync(path.join(SRC,u.replace(/^audio\//,''))));
 if(miss.length)warn(`ملفات صوت ناقصة في المستودع (${miss.length} من ${urls.length}): ${miss.join(', ')}`);
 else console.log(`✔ كل ملفات الصوت موجودة (${urls.length})`);
}

(async()=>{
 for(const f of ['index.html','sw.js','manifest.json']) ok('الملف موجود: '+f,fs.existsSync(path.join(SRC,f)));
 if(failed){process.exit(1)}
 audioFiles();
 await new Promise(r=>server.listen(0,r));const base='http://localhost:'+server.address().port;
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{await responsive(b,base);await swUpdate(b,base)}catch(e){ok('الاختبار كمل بدون انهيار',false,e.message)}
 await b.close();server.close();
 console.log(`\n${results.length-failed} نجح • ${failed} فشل`);
 process.exit(failed?1:0);
})();
