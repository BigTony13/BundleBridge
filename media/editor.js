'use strict';
const vscode=acquireVsCodeApi(), $=id=>document.getElementById(id);
let state, selected=vscode.getState()?.selected, drafts={}, allKeys=[], collapsed=new Set(vscode.getState()?.collapsed||[]);
const send=(type,extra={})=>vscode.postMessage({type,...extra});
const remember=()=>vscode.setState({selected,search:$('search').value,missing:$('missing').checked,collapsed:[...collapsed]});
$('search').value=vscode.getState()?.search||'';$('missing').checked=!!vscode.getState()?.missing;
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function missing(key){return state.files.some(f=>!Object.hasOwn(drafts[f.filename],key)||drafts[f.filename][key]==='');}
function filesInLocaleOrder(){
  if(!state?.files?.length)return [];
  const order=state.localeOrder;
  if(!Array.isArray(order)||!order.length)return state.files;
  const rank=new Map(order.map((locale,i)=>[locale,i]));
  return [...state.files].sort((a,b)=>{
    const ra=rank.has(a.locale)?rank.get(a.locale):Number.MAX_SAFE_INTEGER;
    const rb=rank.has(b.locale)?rank.get(b.locale):Number.MAX_SAFE_INTEGER;
    if(ra!==rb)return ra-rb;
    return a.locale.localeCompare(b.locale);
  });
}
function select(key){selected=key;remember();renderTree();renderEditors();}
function renderTree(){
  if(!state)return;const query=$('search').value.toLowerCase();
  const keys=allKeys.filter(k=>(k.toLowerCase().includes(query)||state.files.some(f=>(Object.hasOwn(drafts[f.filename],k)?drafts[f.filename][k]:'').toLowerCase().includes(query)))&&(!$('missing').checked||missing(k)));
  $('count').textContent=keys.length+' / '+allKeys.length+' keys';$('tree').replaceChildren();
  const root={children:new Map()};
  for(const key of keys){let n=root;const parts=key.split(state.separator||'.');parts.forEach((part,i)=>{if(!n.children.has(part))n.children.set(part,{children:new Map(),path:parts.slice(0,i+1).join(state.separator||'.')});n=n.children.get(part);});n.key=key;}
  function draw(branch,parent){const list=node('ul');for(const [label,n]of branch.children){const li=node('li');
    if(n.children.size){const details=node('details');details.open=!!query||!collapsed.has(n.path);const summary=node('summary',label);details.append(summary);details.addEventListener('toggle',()=>{if(details.open)collapsed.delete(n.path);else collapsed.add(n.path);remember();});if(n.key)details.append(keyButton(n.key,label+' (value)'));draw(n,details);li.append(details);}
    else li.append(keyButton(n.key,label));list.append(li);
  }parent.append(list);}
  function keyButton(key,label){const b=node('button',label,'key'+(key===selected?' selected':''));b.title=key;b.setAttribute('aria-current',key===selected?'true':'false');if(missing(key)){const dot=node('span','●','missing-dot');dot.title='Missing or empty translation';b.append(dot);}b.onclick=()=>select(key);return b;}
  draw(root,$('tree'));if(!keys.length)$('tree').append(node('p','No matching keys.','empty'));
}
function renderEditors(){
  $('key').textContent=selected??'Select a key';$('editors').replaceChildren();
  for(const action of ['copy','duplicate','rename','delete'])$(action).disabled=selected===undefined;
  if(selected===undefined){$('editors').append(node('p','Choose a key on the left, or add your first key.','empty'));return;}
  for(const f of filesInLocaleOrder()){const card=node('article',undefined,'locale-card');const heading=node('div',undefined,'locale-heading');
    let label=f.locale||'Base / fallback';try{if(f.locale)label=new Intl.DisplayNames(['en'],{type:'language'}).of(f.locale.replaceAll('_','-'))+' · '+f.locale;}catch{}
    const left=node('div');left.append(node('h3',label),node('span',f.filename,'filename'));const source=node('button','Open source');source.onclick=()=>send('source',{file:f.filename});heading.append(left,source);card.append(heading);
    const present=Object.hasOwn(drafts[f.filename],selected);const status=node('span',!present?'Not present in this locale':drafts[f.filename][selected]===''?'Empty translation':'Translated','translation-status');
    const textarea=node('textarea');textarea.value=present?drafts[f.filename][selected]:'';textarea.setAttribute('aria-label',label+' translation for '+selected);textarea.spellcheck=true;textarea.lang=f.locale.replaceAll('_','-');
    textarea.addEventListener('input',()=>{const key=selected;Object.defineProperty(drafts[f.filename],key,{value:textarea.value,writable:true,configurable:true,enumerable:true});send('edit',{file:f.filename,key,value:textarea.value});status.textContent=textarea.value?'Translated':'Empty translation';$('footer').textContent='Draft changes are retained when this tab closes. Save bundle to write files.';renderTree();});
    card.append(textarea,status);$('editors').append(card);
  }
}
window.addEventListener('message',event=>{
  const m=event.data;if(m.type==='state'){
    // Keep focused text and caret intact when source document notifications arrive.
    const active=document.activeElement;const focused=active?.tagName==='TEXTAREA';const index=focused?[...document.querySelectorAll('textarea')].indexOf(active):-1;const start=active?.selectionStart,end=active?.selectionEnd;
    state=m;drafts=m.draft?.values||Object.fromEntries(m.files.map(f=>[f.filename,f.values]));allKeys=[...new Set(Object.values(drafts).flatMap(Object.keys))].sort();if(!allKeys.includes(selected))selected=allKeys[0];
    $('title').textContent=m.name;$('footer').textContent=m.files.length+' locale files · '+allKeys.length+' keys'+(m.draft?' · Draft changes retained':' · All changes saved');
    const duplicates=m.files.filter(f=>f.duplicates.length);$('notice').textContent=duplicates.length?'Duplicate source keys found. Resolve duplicates using Open source before saving.':'';
    renderTree();renderEditors();if(index>=0){const area=document.querySelectorAll('textarea')[index];if(area){area.focus();area.setSelectionRange(start,end);}}
  }else if(m.type==='select')select(m.key);else if(m.type==='error'||m.type==='notice'){$('notice').textContent=m.text;$('notice').className=m.type;}
});
$('search').oninput=()=>{remember();renderTree();};$('missing').onchange=()=>{remember();renderTree();};
for(const action of ['add','duplicate','rename','delete','copy','save','discard','settings','format','newLocale','localeOrder'])$(action).onclick=()=>send(action,{key:selected});
$('expand').onclick=()=>{collapsed.clear();remember();renderTree();};
$('collapse').onclick=()=>{for(const k of allKeys){const parts=k.split(state.separator||'.');for(let i=1;i<parts.length;i++)collapsed.add(parts.slice(0,i).join(state.separator||'.'));}remember();renderTree();};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();send('save');}});
send('ready');
