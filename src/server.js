const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

// 去空、去重（忽略大小写）、限长限量
function cleanKeywords(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const s = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
    if (!s || s.length > 60) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 40) break;
  }
  return out;
}

// 先写临时文件再改名，避免写到一半把 config.json 弄坏
function writeKeywords(list) {
  const cfg = readConfig();
  if (!cfg) throw new Error('config.json 读取失败');
  cfg.keywords = list;
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  return list;
}

function page(title) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root{
    --bg:#f4f4f4; --panel:#fff;
    --ink:#333; --ink2:#666; --ink3:#999; --ink4:#bbb;
    --line:#f0f0f0; --line2:#e8e8e8;
    --red:#e33d3d; --red-h:#d02f2f; --red-soft:#fdeceb;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:var(--bg); color:var(--ink);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  a{color:inherit}
  svg{display:block}

  /* ---------- 顶栏 ---------- */
  header{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid var(--line2)}
  .top{max-width:1080px;margin:0 auto;height:56px;padding:0 20px;display:flex;align-items:center;gap:20px}
  .brand{font-size:17px;font-weight:700;letter-spacing:-.4px;white-space:nowrap}
  .brand em{font-style:normal;color:var(--red)}

  .seg{display:flex;gap:22px;height:56px;align-items:center;flex:0 0 auto}
  .seg button{
    position:relative;border:0;background:transparent;font:inherit;font-size:14px;color:var(--ink2);
    padding:0;height:100%;cursor:pointer;display:flex;align-items:center;gap:4px;transition:.12s;
  }
  .seg button:hover{color:var(--ink)}
  .seg button.on{color:var(--red);font-weight:600}
  .seg .lb{position:relative;display:inline-flex;align-items:center;height:100%}
  .seg button.on .lb::after{
    content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--red);
  }
  .seg b{
    display:inline-flex;align-items:center;justify-content:center;
    min-width:19px;height:17px;padding:0 5px;margin-left:5px;
    border-radius:9px;background:var(--red-soft);color:var(--red);
    font-size:11px;font-weight:600;line-height:1;letter-spacing:0;
    font-variant-numeric:tabular-nums;
  }
  .seg b.zero{display:none}

  .search{position:relative;flex:0 1 300px;min-width:120px}
  .search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#bbb;pointer-events:none}
  .search input{
    width:100%;height:32px;padding:0 10px 0 30px;border:1px solid #e5e5e5;border-radius:3px;
    background:#fff;font:inherit;font-size:13px;color:var(--ink);outline:none;transition:.12s;
  }
  .search input::placeholder{color:#bbb}
  .search input:focus{border-color:#ccc}

  .sp{flex:1}
  .count{font-size:12.5px;color:var(--ink3);white-space:nowrap}
  .ghost{
    border:0;background:transparent;font:inherit;font-size:12.5px;color:var(--ink3);
    padding:0;cursor:pointer;white-space:nowrap;transition:.12s;
  }
  .ghost:hover{color:var(--ink)}

  .kws{max-width:1080px;margin:0 auto;padding:0 20px 10px;display:flex;gap:22px;flex-wrap:wrap}
  .kw{
    border:0;background:transparent;font:inherit;font-size:13px;color:var(--ink2);
    padding:0 0 2px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;transition:.12s;
  }
  .kw:hover{color:var(--ink)}
  .kw.on{color:var(--red);font-weight:600;border-bottom-color:var(--red)}

  /* ---------- 列表 ---------- */
  main{max-width:1080px;margin:0 auto;padding:0 20px 100px;background:#fff;min-height:calc(100vh - 90px)}

  .day{display:flex;align-items:center;gap:10px;margin:20px 0 0;font-size:13px;color:var(--ink3)}
  .day::after{content:"";flex:1;height:1px;background:var(--line)}
  .sec{display:flex;align-items:center;gap:12px;margin:30px 0 0;font-size:12px;color:var(--ink4)}
  .sec::before,.sec::after{content:"";flex:1;height:1px;background:var(--line)}

  .card{
    position:relative;display:flex;gap:16px;padding:16px 0;
    border-bottom:1px solid var(--line);transition:background .12s;
  }
  .card:hover{background:#fcfcfc}

  .pic{
    flex:0 0 auto;width:128px;height:128px;border-radius:4px;overflow:hidden;
    background:#f7f7f7;display:block;align-self:flex-start;
  }
  .pic img{width:100%;height:100%;object-fit:cover;display:block}
  .pic.ph{background:#f7f7f7;border:1px dashed #e5e5e5}
  .card.read .pic{opacity:.78}

  .main{min-width:0;flex:1;display:flex;flex-direction:column}

  .t{
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    font-size:16px;line-height:1.45;font-weight:400;color:var(--ink);
    text-decoration:none;margin:0 0 9px;
  }
  .t:hover{color:var(--red)}
  .t .dot{
    display:inline-block;width:6px;height:6px;border-radius:50%;
    background:var(--red);margin-right:7px;vertical-align:2px;
  }
  .card.read .t{color:#999}

  .price{
    display:block;color:var(--red);font-weight:700;font-size:22px;line-height:1.1;
    letter-spacing:-.5px;font-variant-numeric:tabular-nums;margin-bottom:11px;
  }
  .price i{font-style:normal;font-size:14px;font-weight:600;margin-left:1px}
  .price em{font-style:normal;font-size:12.5px;color:var(--ink3);font-weight:400;margin-left:6px;letter-spacing:0}
  .card.read .price{color:#e9a5a5}

  .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:auto}
  .tag{font-size:12px;line-height:20px;color:var(--ink3);background:#f5f5f5;border-radius:2px;padding:0 7px;white-space:nowrap}
  .tag.hot{background:#fff3e8;color:#ff6a00}
  .tag.both{background:#eef4ff;color:#3b7ddd}
  .tag.kw{background:#f5f5f5;color:#888}

  .foot{display:flex;align-items:center;gap:14px;margin-top:12px}
  .stats{display:flex;gap:16px;font-size:13px;color:var(--ink3);font-variant-numeric:tabular-nums;white-space:nowrap}
  .stats>span{display:inline-flex;align-items:center;gap:2px}
  .stats>span>i{font-style:normal;font-size:12.5px;color:var(--ink3)}
  .stats svg{
    width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;
    stroke-linejoin:round;stroke-linecap:round;color:#bbb;
  }
  .stats b{color:var(--ink2);font-weight:600;margin-left:3px}
  .stats .zero,.stats .zero b,.stats .zero svg,.stats .zero i{color:#ccc;font-weight:400}

  .acts{margin-left:auto;display:flex;align-items:center;gap:12px;min-width:0}
  .when{font-size:12.5px;color:var(--ink4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .go{
    flex:0 0 auto;background:var(--red);color:#fff;border-radius:3px;
    font-size:13px;line-height:32px;height:32px;padding:0 18px;
    text-decoration:none;white-space:nowrap;transition:.12s;
  }
  .go:hover{background:var(--red-h)}
  .card.read .go{background:#f0f0f0;color:#aaa}
  .card.read .go:hover{background:var(--red);color:#fff}
  .seen{
    flex:0 0 auto;font-family:inherit;font-size:13px;color:#999;background:transparent;
    border:0;padding:0 2px;cursor:pointer;white-space:nowrap;transition:.12s;
  }
  .seen:hover{color:var(--ink)}

  .more{
    display:block;margin:24px auto 0;background:#fff;border:1px solid #e5e5e5;border-radius:3px;
    padding:8px 26px;font:inherit;font-size:13px;color:var(--ink2);cursor:pointer;transition:.12s;
  }
  .more:hover{border-color:#ccc;color:var(--ink)}

  .empty{text-align:center;padding:90px 20px;color:var(--ink3)}
  .empty svg{color:#ddd;margin:0 auto 14px}
  .empty p{margin:0;font-size:14px;color:var(--ink2)}
  .empty small{display:block;margin-top:6px;font-size:12.5px;color:var(--ink4)}
  .empty .btn{
    margin-top:18px;border:1px solid #e5e5e5;background:#fff;border-radius:3px;
    padding:7px 20px;font:inherit;font-size:13px;color:var(--ink2);cursor:pointer;transition:.12s;
  }
  .empty .btn:hover{border-color:#ccc;color:var(--ink)}

  /* ---------- 关键词弹窗 ---------- */
  .mask{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;padding:20px}
  .mask.on{display:flex}
  .modal{
    width:100%;max-width:400px;background:#fff;border-radius:4px;overflow:hidden;
    display:flex;flex-direction:column;max-height:82vh;box-shadow:0 8px 30px rgba(0,0,0,.16);
  }
  .modal h3{margin:0;padding:16px 18px 12px;font-size:15px;font-weight:600;letter-spacing:-.2px;border-bottom:1px solid var(--line)}
  .mbody{padding:0 18px;overflow:auto;max-height:44vh;min-height:44px}
  .kwrow{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink)}
  .kwrow:last-child{border-bottom:0}
  .kwrow span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kwrow button{border:0;background:transparent;color:#ccc;font-size:17px;line-height:1;cursor:pointer;padding:0 4px;border-radius:3px}
  .kwrow button:hover{color:var(--red);background:var(--red-soft)}
  .mempty{padding:14px 0;color:#bbb;font-size:13px}
  .madd{display:flex;gap:8px;padding:12px 18px;border-top:1px solid var(--line)}
  .madd input{
    flex:1;min-width:0;height:32px;border:1px solid #e5e5e5;border-radius:3px;
    padding:0 10px;font:inherit;font-size:13px;outline:none;
  }
  .madd input:focus{border-color:#ccc}
  .madd button{
    flex:0 0 auto;border:1px solid #e5e5e5;background:#fff;color:var(--ink2);border-radius:3px;
    padding:0 14px;font:inherit;font-size:13px;cursor:pointer;transition:.12s;
  }
  .madd button:hover{border-color:#ccc;color:var(--ink)}
  .mhint{padding:0 18px 12px;font-size:11.5px;color:var(--ink4);line-height:1.55}
  .mfoot{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;background:#fafafa;border-top:1px solid var(--line)}
  .mfoot button{font:inherit;font-size:13px;border-radius:3px;padding:7px 18px;cursor:pointer;border:1px solid transparent;transition:.12s}
  .mfoot .cancel{background:#fff;border-color:#e5e5e5;color:var(--ink2)}
  .mfoot .cancel:hover{border-color:#ccc;color:var(--ink)}
  .mfoot .ok{background:var(--red);color:#fff}
  .mfoot .ok:hover{background:var(--red-h)}

  .toast{
    position:fixed;left:50%;bottom:34px;transform:translate(-50%,10px);z-index:80;
    background:rgba(0,0,0,.82);color:#fff;font-size:13px;padding:9px 18px;border-radius:3px;
    opacity:0;pointer-events:none;transition:.22s;
  }
  .toast.on{opacity:1;transform:translate(-50%,0)}

  @media(max-width:640px){
    .top{height:auto;padding:10px 14px;gap:14px;flex-wrap:wrap}
    .seg{height:34px;gap:18px}
    .search{order:5;flex-basis:100%;min-width:0}
    .count{display:none}
    .kws{padding:0 14px 8px;gap:16px}
    main{padding:0 14px 70px;min-height:0}
    .card{gap:12px;padding:14px 0}
    .pic{width:94px;height:94px}
    .t{font-size:15px;margin-bottom:7px}
    .price{font-size:19px;margin-bottom:9px}
    .foot{gap:10px;margin-top:10px}
    .stats{gap:12px;font-size:12.5px}
    .when{display:none}
    .tags .tag:nth-child(n+4){display:none}
    .go{height:30px;line-height:30px;padding:0 14px;font-size:12.5px}
  }
</style>
</head>
<body>
<header>
  <div class="top">
    <div class="brand">好价<em>监控</em></div>
    <div class="seg" id="seg">
      <button data-view="unread"><span class="lb">未读</span><b id="un-count" class="zero">0</b></button>
      <button data-view="all"><span class="lb">全部</span></button>
    </div>
    <div class="search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>
      </svg>
      <input id="q" placeholder="搜标题、商城…" autocomplete="off">
    </div>
    <span class="sp"></span>
    <span class="count" id="total"></span>
    <button class="ghost" id="kwBtn">关键词</button>
    <button class="ghost" id="mb">全部标已读</button>
  </div>
  <div class="kws" id="chips"></div>
</header>
<main id="list"></main>

<div class="mask" id="kwMask">
  <div class="modal">
    <h3>监控关键词</h3>
    <div class="mbody" id="kwList"></div>
    <div class="madd">
      <input id="kwInput" placeholder="加一个关键词，回车确认" maxlength="60" autocomplete="off">
      <button id="kwAdd">添加</button>
    </div>
    <div class="mhint">一个词一次搜索，写宽一点（品牌 + 品类）命中更多。保存后下一轮采集就生效，不用重启。</div>
    <div class="mfoot">
      <button class="cancel" id="kwCancel">取消</button>
      <button class="ok" id="kwSave">保存</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
var ALL=[], READ=new Set(), BASE=0;
var KW='全部', VIEW='unread', Q='', SHOWN=60, KWEDIT=[], CFGKWS=null;

function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function hhmm(ts){var d=new Date(ts);var p=function(n){return String(n).padStart(2,'0');};return p(d.getHours())+':'+p(d.getMinutes());}
function dayKey(ts){var d=new Date(ts);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
function dayLabel(ts){
  var d=new Date(ts), n=new Date();
  var a=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  var b=new Date(n.getFullYear(),n.getMonth(),n.getDate());
  var diff=Math.round((b-a)/86400000);
  if(diff===0)return '今天';
  if(diff===1)return '昨天';
  if(diff===2)return '前天';
  return (d.getMonth()+1)+' 月 '+d.getDate()+' 日';
}
function isUnread(x){
  if(READ.has(x.articleId))return false;
  return new Date(x.fetchedAt||0).getTime()>BASE;
}
function srcTag(x){
  var s=x.sorts||[];
  if(s.indexOf('time')>=0&&s.indexOf('default')>=0)return '<span class="tag both">最新+综合</span>';
  if(s.indexOf('default')>=0)return '<span class="tag hot">综合热门</span>';
  return '';
}

// 值得买自带的标签，挑最多 3 个；带「新低/必买」字样的高亮
function smzdmTags(x){
  var arr=(x.tags||[]).filter(function(t){return t&&t!==x.mall;}).slice(0,3);
  return arr.map(function(t){
    var hot=/新低|必买|绝对值|历史|补贴|神价/.test(t);
    return '<span class="tag'+(hot?' hot':'')+'">'+esc(t)+'</span>';
  }).join('');
}

// 大图：把 _d250 之类的缩略后缀换成 _d800
function bigImg(u){
  if(!u)return '';
  return String(u).replace(/_d\\d+\\.(jpg|jpeg|png|webp)$/i, '_d800.$1');
}

// 把 "28.46元（需用券）" 拆成  大号数字 + 小号单位 + 灰色备注
function priceHtml(t){
  var s=String(t==null?'':t).trim();
  if(!s)return '<span class="price">—</span>';
  var m=s.match(/^([\\d.,]+)([^\\d]*)$/);
  if(!m)return '<span class="price">'+esc(s)+'</span>';
  var tail=m[2]||'', unit='', rest=tail;
  var um=tail.match(/^(元|¥|￥)\\s*(.*)$/);
  if(um){unit=um[1];rest=um[2];}
  return '<span class="price">'+m[1]
    +(unit?'<i>'+unit+'</i>':'')
    +(rest?'<em>'+esc(rest)+'</em>':'')
    +'</span>';
}

// 值 / 不值 / 收藏★ / 评论💬，全 0 的淡显
function statsHtml(x){
  var star='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.7 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
  var chat='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 15.6a2.4 2.4 0 0 1-2.4 2.4H9.2L5.2 21v-3H6.9a2.4 2.4 0 0 1-2.4-2.4V7.9a2.4 2.4 0 0 1 2.4-2.4h10.2a2.4 2.4 0 0 1 2.4 2.4z"/></svg>';
  var cell=function(v,label,icon){
    return '<span class="'+(v?'':'zero')+'">'+(icon||'')+(label?'<i>'+label+'</i>':'')+'<b>'+v+'</b></span>';
  };
  return '<div class="stats">'
    +cell(x.worthy||0,'值')
    +cell(x.unworthy||0,'不值')
    +cell(x.favs||0,'',star)
    +cell(x.comments||0,'',chat)
    +'</div>';
}

function filtered(){
  var rows=ALL;
  if(KW!=='全部')rows=rows.filter(function(x){return x.keyword===KW;});
  if(Q){var q=Q.trim().toLowerCase();
    rows=rows.filter(function(x){
      return String(x.title||'').toLowerCase().indexOf(q)>=0 || String(x.mall||'').toLowerCase().indexOf(q)>=0;
    });}
  if(VIEW==='unread')rows=rows.filter(isUnread);
  return rows;
}

function updateStat(){
  var un=ALL.filter(isUnread).length;
  var b=$('un-count');
  b.textContent=un;
  b.className=un?'':'zero';
  $('total').textContent='共 '+ALL.length+' 条';
}

function render(){
  var rows=filtered(), list=$('list');
  if(!rows.length){
    var msg = VIEW==='unread' ? '都处理完了' : '没有匹配的记录';
    var sub = VIEW==='unread' ? '切到「全部」可以翻历史' : '换个关键词试试';
    list.innerHTML='<div class="empty">'
      +'<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
      +'<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>'
      +'<p>'+msg+'</p><small>'+sub+'</small>'
      +(VIEW==='unread'?'<button class="btn" id="emptyGo">翻历史</button>':'')
      +'</div>';
    var eg=$('emptyGo');
    if(eg)eg.onclick=function(){setView('all');};
    updateStat();
    return;
  }

  // 未读排前面，已读沉底；两段内部各自保持发布时间倒序
  var unRows=rows.filter(isUnread), readRows=rows.filter(function(x){return !isUnread(x);});
  var ordered=unRows.concat(readRows);
  var shown=ordered.slice(0,SHOWN), html='', lastDay='', cut=unRows.length;

  for(var i=0;i<shown.length;i++){
    if(i===cut && readRows.length && cut>0){
      html+='<div class="sec">已读 · '+readRows.length+' 条</div>';
      lastDay='';
    }
    var x=shown[i], dk=dayKey(x.pubTime);
    if(dk!==lastDay){html+='<div class="day">'+dayLabel(x.pubTime)+'</div>';lastDay=dk;}
    var un=isUnread(x), id=esc(x.articleId);

    var img=bigImg(x.imgUrl);
    var pic = img
      ? '<a class="pic" href="'+esc(x.url)+'" target="_blank" rel="noreferrer" onclick="opened(\\''+id+'\\')">'
        +'<img src="'+esc(img)+'"'+(img!==x.imgUrl?' data-s="'+esc(x.imgUrl)+'"':'')
        +' alt="" loading="lazy" onerror="imgFail(this)"></a>'
      : '<span class="pic ph"></span>';

    var when='';
    if(x.mall)when+=esc(x.mall);
    if(x.timeText)when+=(when?' · ':'')+esc(x.timeText);

    html+='<div class="card '+(un?'unread':'read')+'" id="r-'+id+'">'
      +pic
      +'<div class="main">'
        +'<a class="t" href="'+esc(x.url)+'" target="_blank" rel="noreferrer" onclick="opened(\\''+id+'\\')">'
          +(un?'<span class="dot"></span>':'')+esc(x.title)+'</a>'
        +priceHtml(x.priceText)
        +'<div class="tags"><span class="tag kw">'+esc(x.keyword)+'</span>'+srcTag(x)+smzdmTags(x)+'</div>'
        +'<div class="foot">'+statsHtml(x)
          +'<div class="acts">'
            +(when?'<span class="when" title="推于 '+hhmm(x.fetchedAt)+'">'+when+'</span>':'')
            +(un?'<button class="seen" onclick="done(\\''+id+'\\')">已看</button>':'')
            +(x.buyUrl?'<a class="go" href="'+esc(x.buyUrl)+'" target="_blank" rel="noreferrer" onclick="opened(\\''+id+'\\')">去购买</a>':'')
          +'</div>'
        +'</div>'
      +'</div></div>';
  }
  if(ordered.length>shown.length){
    html+='<button class="more" id="more">还有 '+(ordered.length-shown.length)+' 条</button>';
  }
  list.innerHTML=html;
  var mb=$('more');
  if(mb)mb.onclick=function(){SHOWN+=60;render();};
  updateStat();
}

// chip 以 config 里的当前关键词为准（CFGKWS）。
// 历史记录里的旧关键词不再出现在 chip 行，但记录本身仍在「全部」里可查
function renderChips(){
  var kws=['全部'].concat(
    (CFGKWS&&CFGKWS.length)?CFGKWS:Array.from(new Set(ALL.map(function(x){return x.keyword;})))
  );
  $('chips').innerHTML=kws.map(function(k){
    return '<button class="kw '+(k===KW?'on':'')+'" data-kw="'+esc(k)+'">'+esc(k)+'</button>';
  }).join('');
}
function setKW(k){KW=k;SHOWN=60;renderChips();render();}
function setView(v){
  VIEW=v;SHOWN=60;
  var bs=document.querySelectorAll('#seg button');
  for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].getAttribute('data-view')===v);
  render();
}
function markLocal(id){
  READ.add(id);
  var r=document.getElementById('r-'+id);
  if(r){
    r.classList.remove('unread');r.classList.add('read');
    var b=r.querySelector('button.seen');
    if(b)b.remove();
  }
  updateStat();
}
// 大图挂了退回缩略图，缩略图也挂就留灰块
function imgFail(el){
  var s=el.getAttribute('data-s');
  if(s){el.removeAttribute('data-s');el.src=s;return;}
  el.parentNode.classList.add('ph');el.remove();
}

function opened(id){
  if(READ.has(id))return;
  READ.add(id);
  try{
    navigator.sendBeacon('/api/read',new Blob([JSON.stringify({id:id})],{type:'application/json'}));
  }catch(e){
    fetch('/api/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
  }
  markLocal(id);
}
function done(id){
  if(!READ.has(id)){
    READ.add(id);
    fetch('/api/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
  }
  markLocal(id);
  // 稍等一下再重排，让「已看」的卡片沉到已读区
  setTimeout(render,260);
}
async function markAll(){
  var ids=filtered().map(function(x){return x.articleId;});
  if(!ids.length)return;
  if(!confirm('把当前列表 '+ids.length+' 条全部标为已读？'))return;
  await fetch('/api/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids})});
  ids.forEach(function(i){READ.add(i);});
  render();
}
var qt;
// ---------- 关键词编辑 ----------
function toast(msg){
  var t=$('toast');t.textContent=msg;t.classList.add('on');
  clearTimeout(t._tm);t._tm=setTimeout(function(){t.classList.remove('on');},2400);
}
function renderKw(){
  var l=$('kwList');
  if(!KWEDIT.length){l.innerHTML='<div class="mempty">还没有关键词，下面加一个</div>';return;}
  l.innerHTML=KWEDIT.map(function(k,i){
    return '<div class="kwrow"><span>'+esc(k)+'</span><button data-i="'+i+'" title="删除">×</button></div>';
  }).join('');
}
function openKw(){
  fetch('/api/keywords',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
    KWEDIT=(d.keywords||[]).slice();
    renderKw();
    $('kwMask').classList.add('on');
    $('kwInput').value='';
    $('kwInput').focus();
  }).catch(function(){toast('读取关键词失败，确认服务在跑');});
}
function closeKw(){$('kwMask').classList.remove('on');}
function addKw(){
  var inp=$('kwInput'), v=inp.value.trim().replace(/\s+/g,' ');
  if(!v)return;
  if(v.length>60){toast('太长了，60 字以内');return;}
  if(KWEDIT.some(function(k){return k.toLowerCase()===v.toLowerCase();})){inp.value='';toast('已经有这个词了');return;}
  KWEDIT.push(v);inp.value='';renderKw();
  $('kwList').scrollTop=$('kwList').scrollHeight;
  inp.focus();
}
function saveKw(){
  var btn=$('kwSave');btn.disabled=true;
  fetch('/api/keywords',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keywords:KWEDIT})})
    .then(function(r){return r.json();})
    .then(function(d){
      btn.disabled=false;
      if(!d.ok){toast('保存失败：'+(d.error||'未知错误'));return;}
      KWEDIT=d.keywords||KWEDIT;
      CFGKWS=KWEDIT.slice();
      if(KW!=='全部'&&CFGKWS.indexOf(KW)<0){KW='全部';}
      renderChips();render();
      closeKw();
      toast('已保存 '+KWEDIT.length+' 个关键词，下一轮采集生效');
    })
    .catch(function(){btn.disabled=false;toast('保存失败，检查服务是否在跑');});
}

function bind(){
  $('seg').addEventListener('click',function(e){
    var b=e.target.closest('button[data-view]');
    if(b)setView(b.getAttribute('data-view'));
  });
  $('chips').addEventListener('click',function(e){
    var b=e.target.closest('button[data-kw]');
    if(b)setKW(b.getAttribute('data-kw'));
  });
  $('mb').onclick=markAll;
  $('kwBtn').onclick=openKw;
  $('kwCancel').onclick=closeKw;
  $('kwAdd').onclick=addKw;
  $('kwSave').onclick=saveKw;
  $('kwInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){e.preventDefault();addKw();}
  });
  $('kwList').addEventListener('click',function(e){
    var b=e.target.closest('button[data-i]');
    if(b){KWEDIT.splice(Number(b.getAttribute('data-i')),1);renderKw();}
  });
  $('kwMask').addEventListener('click',function(e){if(e.target===$('kwMask'))closeKw();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeKw();});
  $('q').addEventListener('input',function(e){
    var v=e.target.value;
    clearTimeout(qt);
    qt=setTimeout(function(){Q=v;SHOWN=60;render();},140);
  });
}
async function load(){
  try{
    var r=await fetch('/api/deals',{cache:'no-store'});
    var d=await r.json();
    ALL=d.items||[];
    READ=new Set(d.read||[]);
    BASE=new Date(d.baseline||0).getTime();
    renderChips();render();
  }catch(e){}
}
async function loadKwCfg(){
  try{
    var r=await fetch('/api/keywords',{cache:'no-store'});
    var d=await r.json();
    CFGKWS=d.keywords||[];
    if(KW!=='全部'&&CFGKWS.indexOf(KW)<0)KW='全部';
    renderChips();
  }catch(e){}
}
bind();
setView('unread');
loadKwCfg();
load();
setInterval(load,60000);
</script>
</body>
</html>`;
}

function createServer(store, cfg, reads) {
  const port = (cfg.server && cfg.server.port) || 7788;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/deals')) {
      const snap = reads.snapshot();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          baseline: snap.baseline,
          read: snap.read,
          items: store.recent(0),
        })
      );
      return;
    }

    if (req.url.startsWith('/api/read') && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1e6) req.destroy();
      });
      req.on('end', () => {
        let marked = 0;
        try {
          const d = JSON.parse(body || '{}');
          marked = reads.mark(d.ids || d.id);
        } catch (_) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, marked }));
      });
      return;
    }

    if (req.url.startsWith('/api/keywords')) {
      if (req.method === 'GET') {
        const c = readConfig();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ keywords: (c && c.keywords) || [] }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 1e6) req.destroy();
        });
        req.on('end', () => {
          let out = { ok: false, error: '解析失败' };
          try {
            const d = JSON.parse(body || '{}');
            const list = cleanKeywords(d.keywords);
            writeKeywords(list);
            out = { ok: true, keywords: list };
          } catch (e) {
            out = { ok: false, error: e.message };
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out));
        });
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('好价记录'));
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`  历史页 http://localhost:${port}`);
  });
  server.on('error', (e) => {
    console.error(`  历史页启动失败: ${e.message}`);
  });
  return server;
}

module.exports = { createServer };

// 单独启动历史页：node src/server.js
if (require.main === module) {
  const { Store, Reads } = require('./store');
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const store = new Store();
  createServer(store, cfg, new Reads());
}
