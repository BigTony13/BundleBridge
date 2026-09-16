'use strict';
const vscode=acquireVsCodeApi(), $=id=>document.getElementById(id);
let state, selected=vscode.getState()?.selected, drafts={}, allKeys=[], collapsed=new Set(vscode.getState()?.collapsed||[]);
const send=(type,extra={})=>vscode.postMessage({type,...extra});
const settingsOnly=document.body.classList.contains('settings-only');
const remember=()=>vscode.setState({selected,search:$('search')?.value||'',missing:!!$('missing')?.checked,duplicates:!!$('duplicates')?.checked,collapsed:[...collapsed]});
if(!settingsOnly){$('search').value=vscode.getState()?.search||'';$('missing').checked=!!vscode.getState()?.missing;$('duplicates').checked=!!vscode.getState()?.duplicates;}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function missing(key){return state.files.some(f=>!Object.hasOwn(drafts[f.filename],key)||drafts[f.filename][key]==='');}
function duplicateKey(key){return state?.files?.some(f=>f.duplicates?.includes(key));}
function duplicateKeysList(){return [...new Set(state.files.flatMap(f=>f.duplicates||[]))].sort();}
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
function showDuplicatesInTree(){
  $('duplicates').checked=true;
  const keys=duplicateKeysList();
  if(keys.length&&!duplicateKey(selected))selected=keys[0];
  remember();renderDuplicateNotice();renderTree();renderEditors();
}
function renderDuplicateNotice(){
  const notice=$('notice');
  if(!state){notice.replaceChildren();return;}
  const affected=state.files.filter(f=>f.duplicates?.length);
  if(!affected.length){notice.replaceChildren();notice.className='';return;}
  const keyCount=duplicateKeysList().length;
  notice.className='warning';
  notice.replaceChildren();
  const copy=node('p',undefined,'duplicate-notice-copy');
  copy.textContent='Duplicate source keys in '+affected.length+' file'+(affected.length===1?'':'s')+' ('+keyCount+' key'+(keyCount===1?'':'s')+'). The editor shows the last value for each key. Remove extra lines in the source file before saving.';
  const actions=node('div',undefined,'notice-actions');
  const show=node('button','Show in tree');show.onclick=showDuplicatesInTree;
  actions.append(show);
  for(const f of affected){
    const open=node('button','Open '+f.filename);
    open.title='Open '+f.filename+' in the source editor';
    open.onclick=()=>send('source',{file:f.filename});
    actions.append(open);
  }
  notice.append(copy,actions);
}
function hasPendingChanges(){return!!state?.draft||(state?.dirtySourceFiles?.length??0)>0;}
function renderSaveStatus(){
  const el=$('saveStatus');if(!el)return;
  const hasDraft=!!state?.draft;const dirty=state?.dirtySourceFiles||[];
  if(!hasDraft&&!dirty.length){el.hidden=true;el.replaceChildren();return;}
  el.hidden=false;el.replaceChildren();
  if(hasDraft)el.append(node('span','● Unsaved bundle edits','save-status-draft'));
  if(dirty.length){
    const label=node('span',undefined,'save-status-source');
    label.textContent='◦ Unsaved source file'+(dirty.length===1?'':'s')+': '+dirty.join(', ');
    el.append(label);
  }
  $('save')?.classList.toggle('needs-save',hasDraft||dirty.length>0);
  if($('discard'))$('discard').disabled=!hasDraft;
}
function renderFooter(){
  if(!state)return;
  const parts=[state.files.length+' locale files',allKeys.length+' keys'];
  if(state.draft)parts.push('Unsaved bundle edits');
  else if((state.dirtySourceFiles||[]).length)parts.push('Unsaved source files — save bundle or save in the editor');
  else parts.push('All changes saved');
  $('footer').textContent=parts.join(' · ');
}
function select(key){selected=key;remember();renderTree();renderEditors();}
function renderTree(){
  if(!state)return;const query=$('search').value.toLowerCase();const dupOnly=$('duplicates').checked;
  const keys=allKeys.filter(k=>(k.toLowerCase().includes(query)||state.files.some(f=>(Object.hasOwn(drafts[f.filename],k)?drafts[f.filename][k]:'').toLowerCase().includes(query)))&&(!$('missing').checked||missing(k))&&(!dupOnly||duplicateKey(k)));
  $('count').textContent=keys.length+' / '+allKeys.length+' keys';$('tree').replaceChildren();
  const root={children:new Map()};
  for(const key of keys){let n=root;const parts=key.split(state.separator||'.');parts.forEach((part,i)=>{if(!n.children.has(part))n.children.set(part,{children:new Map(),path:parts.slice(0,i+1).join(state.separator||'.')});n=n.children.get(part);});n.key=key;}
  function draw(branch,parent){const list=node('ul');for(const [label,n]of branch.children){const li=node('li');
    if(n.children.size){const details=node('details');details.open=!!query||dupOnly||!collapsed.has(n.path);const summary=node('summary',label);details.append(summary);details.addEventListener('toggle',()=>{if(details.open)collapsed.delete(n.path);else collapsed.add(n.path);remember();});if(n.key)details.append(keyButton(n.key,label+' (value)'));draw(n,details);li.append(details);}
    else li.append(keyButton(n.key,label));list.append(li);
  }parent.append(list);}
  function keyButton(key,label){const b=node('button',label,'key'+(key===selected?' selected':''));b.title=key;b.setAttribute('aria-current',key===selected?'true':'false');if(missing(key)){const dot=node('span','●','missing-dot');dot.title='Missing or empty translation';b.append(dot);}if(duplicateKey(key)){const dot=node('span','⚠','duplicate-dot');dot.title='Duplicate key in source file';b.append(dot);}b.onclick=()=>select(key);return b;}
  draw(root,$('tree'));if(!keys.length)$('tree').append(node('p',dupOnly?'No duplicate source keys match the current search.':'No matching keys.','empty'));
}
function renderEditors(){
  $('key').textContent=selected??'Select a key';$('editors').replaceChildren();
  for(const action of ['copy','duplicate','rename','delete'])$(action).disabled=selected===undefined;
  if(selected===undefined){$('editors').append(node('p','Choose a key on the left, or add your first key.','empty'));return;}
  for(const f of filesInLocaleOrder()){const card=node('article',undefined,'locale-card');const heading=node('div',undefined,'locale-heading');
    let label=f.locale||'Base / fallback';try{if(f.locale)label=new Intl.DisplayNames(['en'],{type:'language'}).of(f.locale.replaceAll('_','-'))+' · '+f.locale;}catch{}
    const left=node('div');const filename=node('span',f.filename,'filename');if(f.sourceDirty){filename.append(node('span',' Unsaved','source-dirty-badge'));filename.title='This file has unsaved changes in the source editor';}left.append(node('h3',label),filename);const source=node('button','Open source');source.onclick=()=>send('source',{file:f.filename});heading.append(left,source);card.append(heading);
    if(f.sourceDirty)card.classList.add('source-dirty');
    if(f.duplicates?.includes(selected)){
      const count=f.duplicateCounts?.[selected]??2;
      card.classList.add('has-duplicate');
      card.append(node('p','Duplicate in source (×'+count+'). Open source and delete the extra entries for this key.','duplicate-warning'));
    }
    const present=Object.hasOwn(drafts[f.filename],selected);const status=node('span',!present?'Not present in this locale':drafts[f.filename][selected]===''?'Empty translation':'Translated','translation-status');
    const textarea=node('textarea');textarea.value=present?drafts[f.filename][selected]:'';textarea.setAttribute('aria-label',label+' translation for '+selected);textarea.spellcheck=true;textarea.lang=f.locale.replaceAll('_','-');
    textarea.addEventListener('input',()=>{const key=selected;Object.defineProperty(drafts[f.filename],key,{value:textarea.value,writable:true,configurable:true,enumerable:true});send('edit',{file:f.filename,key,value:textarea.value});status.textContent=textarea.value?'Translated':'Empty translation';renderTree();});
    card.append(textarea,status);$('editors').append(card);
  }
}
window.addEventListener('message',event=>{
  const m=event.data;if(m.type==='state'){
    // Keep focused text and caret intact when source document notifications arrive.
    const active=document.activeElement;const focused=active?.tagName==='TEXTAREA';const index=focused?[...document.querySelectorAll('textarea')].indexOf(active):-1;const start=active?.selectionStart,end=active?.selectionEnd;
    state=m;drafts=m.draft?.values||Object.fromEntries(m.files.map(f=>[f.filename,f.values]));allKeys=[...new Set(Object.values(drafts).flatMap(Object.keys))].sort();if(!allKeys.includes(selected))selected=allKeys[0];
    $('title').textContent=m.name;renderSaveStatus();renderFooter();renderDuplicateNotice();
    renderTree();renderEditors();if(index>=0){const area=document.querySelectorAll('textarea')[index];if(area){area.focus();area.setSelectionRange(start,end);}}
  }else if(m.type==='select')select(m.key);
  else if(m.type==='settingsPanel')showSettingsPanel(m);
  else if(m.type==='hideSettings')hideSettingsPanel();
  else if(m.type==='error'||m.type==='notice')renderStatusMessage(m);
});
let settingsOpen=false;
function showSettingsPanel(m){
  settingsOpen=true;document.body.classList.add('settings-open');
  $('settingsPanel').hidden=false;if($('editorMain'))$('editorMain').hidden=true;
  $('settingsScope').textContent=(m.scopeLabel||'Settings')+' · Changes apply when you save or format locale files.';
  renderSettingsForm(m);
  if(m.focusLocaleOrder){const el=$('localeOrderField');if(el){el.focus();el.scrollIntoView({block:'center'});}}
}
function hideSettingsPanel(){
  if(document.body.classList.contains('settings-only')){send('closeSettings');return;}
  settingsOpen=false;document.body.classList.remove('settings-open');
  $('settingsPanel').hidden=true;if($('editorMain'))$('editorMain').hidden=false;
}
function renderSettingsForm(m){
  const form=$('settingsForm');form.replaceChildren();
  for(const group of m.groups||[]){
    const section=node('section',undefined,'settings-group');
    section.append(node('h3',group.title));
    for(const field of group.settings)section.append(renderSettingField(field,m.values));
    form.append(section);
  }
  const localeSection=node('section',undefined,'settings-group');
  localeSection.append(node('h3','Translation panel'));
  const localeLabel=m.localeOrderKey==='workspaceLocaleOrder'?'Workspace locale order':'User locale order';
  localeSection.append(node('p','One locale per line. Use a blank line or "" for the base .properties file.','settings-hint'));
  const localeField=node('textarea');localeField.id='localeOrderField';localeField.rows=6;localeField.spellcheck=false;
  localeField.value=(m.localeOrder||[]).map(l=>l===''?'':l).join('\n');
  localeField.setAttribute('aria-label',localeLabel);
  localeField.addEventListener('change',()=>{
    const lines=localeField.value.split('\n').map(line=>{const t=line.trim();return t==='""'?'':t;});
    send('setSetting',{key:m.localeOrderKey,value:lines});
  });
  localeSection.append(node('label',localeLabel),localeField);
  form.append(localeSection);
}
function renderSettingField(field,values){
  const wrap=node('div',undefined,'settings-field');
  const id='setting-'+field.key;const val=values[field.key];
  if(field.type==='boolean'){
    const label=node('label');const input=node('input');input.type='checkbox';input.id=id;input.checked=!!val;
    input.addEventListener('change',()=>send('setSetting',{key:field.key,value:input.checked}));
    label.append(input,node('span',field.label));wrap.append(label);return wrap;
  }
  const label=node('label',field.label);label.htmlFor=id;wrap.append(label);
  if(field.type==='enum'){
    const select=node('select');select.id=id;
    for(const opt of field.options){const o=node('option',opt);o.value=opt;if(opt===val)o.selected=true;select.append(o);}
    select.addEventListener('change',()=>send('setSetting',{key:field.key,value:select.value}));
    wrap.append(select);return wrap;
  }
  const input=node('input');input.id=id;input.type=field.type==='number'?'number':'text';input.value=val??'';
  if(field.min!=null)input.min=String(field.min);if(field.max!=null)input.max=String(field.max);
  input.addEventListener('change',()=>send('setSetting',{key:field.key,value:field.type==='number'?Number(input.value):input.value}));
  wrap.append(input);return wrap;
}
function renderStatusMessage(m){
  const notice=$('notice');
  notice.className=m.type||'';
  notice.replaceChildren();
  notice.append(node('p',m.text,'status-copy'));
  if(m.showLog){
    const actions=node('div',undefined,'notice-actions');
    const view=node('button','View diagnostic log');
    view.onclick=()=>send('showLog');
    actions.append(view);
    notice.append(actions);
  }
}
if(!settingsOnly){
  $('search').oninput=()=>{remember();renderTree();};$('missing').onchange=()=>{remember();renderTree();};
  $('duplicates').onchange=()=>{if($('duplicates').checked){const keys=duplicateKeysList();if(keys.length&&!duplicateKey(selected))selected=keys[0];}remember();renderTree();renderEditors();};
  for(const action of ['add','duplicate','rename','delete','copy','save','discard','format','newLocale'])$(action).onclick=()=>send(action,{key:selected});
  $('settings').onclick=()=>send('localeOrder');
  $('expand').onclick=()=>{collapsed.clear();remember();renderTree();};
  $('collapse').onclick=()=>{for(const k of allKeys){const parts=k.split(state?.separator||'.');for(let i=1;i<parts.length;i++)collapsed.add(parts.slice(0,i).join(state?.separator||'.'));}remember();renderTree();};
  send('ready');
}else send('standaloneSettingsReady');
$('closeSettings').onclick=()=>send('closeSettings');
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();if(!settingsOnly)send('save');}});
