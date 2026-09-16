'use strict';
const vscode=require('vscode');
const crypto=require('node:crypto');
const {parse,format,bundleName,bundleFileName,normalizeBundleBase,validateBundleBase,folderLocales,buildLocaleTag,localeTagError,normalizeLocaleOrder,sortFilesByLocaleOrder,values,duplicateKeyInfo,defaults}=require('./properties');
const {replaceFullDocument,summarizeApplyFailures}=require('./applyDocument');
const {bundleLog,showBundleLog,logLines}=require('./log');
function localeOrderFromInspect(inspected,layers){
  if(!inspected)return[];
  for(const layer of layers){
    if(inspected[layer]!==undefined)return normalizeLocaleOrder(inspected[layer]);
  }
  return[];
}
function readWorkspaceLocaleOrder(configUri){
  return localeOrderFromInspect(vscode.workspace.getConfiguration('bundleBridge',configUri).inspect('workspaceLocaleOrder'),['workspaceFolderValue','workspaceValue']);
}
function readUserLocaleOrder(){
  return localeOrderFromInspect(vscode.workspace.getConfiguration('bundleBridge').inspect('userLocaleOrder'),['globalValue']);
}
function readLocaleOrder(configUri){
  if(vscode.workspace.workspaceFolders?.length)return readWorkspaceLocaleOrder(configUri);
  return readUserLocaleOrder();
}
function localeOrderSettingKey(){
  return vscode.workspace.workspaceFolders?.length?'workspaceLocaleOrder':'userLocaleOrder';
}
function localeOrderUpdateTarget(){
  return vscode.workspace.workspaceFolders?.length?vscode.ConfigurationTarget.Workspace:vscode.ConfigurationTarget.Global;
}
async function appendLocaleToOrderSetting(configUri,locale){
  const previous=readLocaleOrder(configUri);
  if(previous.includes(locale))return;
  await vscode.workspace.getConfiguration('bundleBridge',configUri).update(localeOrderSettingKey(),[...previous,locale],localeOrderUpdateTarget());
}
const panels=new Map();
function encodeText(text){return new TextEncoder().encode(text);}
async function promptAddLocale(files,bundleBase,folder,draft){
  if(draft)throw Error('Save or discard the current draft before adding a locale file.');
  const source=await vscode.window.showQuickPick(files.map(f=>({label:f.locale||'Base / fallback',description:f.filename,detail:'Duplicate keys and formatting from this file',file:f})),{title:'Add new locale — duplicate from',placeHolder:'Choose source file'});
  if(!source)return;
  const language=await vscode.window.showInputBox({title:'Add new locale — language',prompt:'ISO 639 language subtag (e.g. en, fr, zh). Leave empty only for a base fallback file.',placeHolder:'Language'});
  if(language===undefined)return;
  const script=await vscode.window.showInputBox({title:'Add new locale — script (optional)',prompt:'Unicode script subtag, e.g. Hant for zh_Hant_TW',placeHolder:'Script'});
  if(script===undefined)return;
  const region=await vscode.window.showInputBox({title:'Add new locale — region (optional)',prompt:'ISO 3166 country (US) or UN M.49 region (419)',placeHolder:'Region'});
  if(region===undefined)return;
  const variant=await vscode.window.showInputBox({title:'Add new locale — variant (optional)',prompt:'Extra locale segment when needed',placeHolder:'Variant'});
  if(variant===undefined)return;
  const parts={language,script,region,variant};
  const err=localeTagError(parts);if(err)throw Error(err);
  const tag=buildLocaleTag(parts);
  if(files.some(f=>f.locale===tag))throw Error((tag?`_${tag}`:' Base')+' properties file already exists in this bundle.');
  const filename=bundleFileName(bundleBase,tag);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder,filename),encodeText(source.file.doc.getText()));
  await appendLocaleToOrderSetting(folder,tag);
  return filename;
}
async function createBundle(uri){
  if(uri?.path?.endsWith('.properties'))uri=vscode.Uri.joinPath(uri,'..');
  if(!uri){
    const folder=vscode.workspace.workspaceFolders?.[0];
    if(!folder)throw Error('Open a workspace folder first.');
    uri=folder.uri;
  }
  const children=await vscode.workspace.fs.readDirectory(uri);
  const filenames=children.filter(([,type])=>type===vscode.FileType.File).map(([name])=>name);
  const locales=folderLocales(filenames);
  const targetLocales=locales.length?locales:[''];
  const existing=new Set(filenames);
  const localeHint=targetLocales.map(l=>l?`_${l}`:' (base)').join(', ');
  const base=await vscode.window.showInputBox({
    title:'New resource bundle',
    prompt:targetLocales.length>1||targetLocales[0]?'Creates files for locales used in this folder:'+localeHint:'Creates a base .properties file in this folder',
    placeHolder:'BundleName',
    validateInput:v=>{
      const err=validateBundleBase(v);if(err)return err;
      const name=normalizeBundleBase(v);
      for(const locale of targetLocales){const filename=bundleFileName(name,locale);if(existing.has(filename))return filename+' already exists';}
      return null;
    },
  });
  if(base===undefined)return;
  const name=normalizeBundleBase(base);
  for(const locale of targetLocales){
    const filename=bundleFileName(name,locale);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uri,filename),new Uint8Array(0));
    await appendLocaleToOrderSetting(uri,locale);
  }
  const openFile=bundleFileName(name,targetLocales.includes('')?'':targetLocales[0]);
  await vscode.commands.executeCommand('bundleBridge.open',vscode.Uri.joinPath(uri,openFile));
}
function activate(context) {
  const log=bundleLog(context);
  context.subscriptions.push(vscode.commands.registerCommand('bundleBridge.showLog',()=>showBundleLog()));
  context.subscriptions.push(vscode.commands.registerCommand('bundleBridge.createBundle',async uri=>{try{await createBundle(uri);}catch(e){vscode.window.showErrorMessage(e.message);}}));
  context.subscriptions.push(vscode.commands.registerCommand('bundleBridge.open',async uri=>{
    try {
      uri=uri||vscode.window.activeTextEditor?.document.uri;
      if(!uri){const picked=await vscode.window.showOpenDialog({filters:{Properties:['properties']},canSelectMany:false});uri=picked?.[0];}
      if(!uri)return;
      const name=bundleName(uri.path.split('/').pop());if(!name)throw Error('Choose a .properties file.');
      const folder=vscode.Uri.joinPath(uri,'..'), id=folder.toString()+'/'+name.base;
      if(panels.has(id)){panels.get(id).reveal();return;}
      const panel=vscode.window.createWebviewPanel('bundleBridge',name.base+' · Bundle',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]});
      panels.set(id,panel);
      const storageKey='draft:'+id;
      let draft=context.workspaceState.get(storageKey), files=[], activeLocaleOrder=[], chain=Promise.resolve(), disposed=false;
      const configUri=folder;
      const persist=()=>context.workspaceState.update(storageKey,draft);
      const title=()=>panel.title=(draft?'● ':'')+name.base+' · Bundle';
      async function discover(){
        const children=await vscode.workspace.fs.readDirectory(folder); const found=[];
        for(const [filename,type]of children){const n=bundleName(filename);if(type!==vscode.FileType.File||n?.base!==name.base)continue;
          const doc=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder,filename));
          const model=parse(doc.getText());
          const {duplicates,duplicateCounts}=duplicateKeyInfo(model);
          found.push({filename,locale:n.locale,doc,model,duplicates,duplicateCounts});
        }
        activeLocaleOrder=readLocaleOrder(configUri);
        files=sortFilesByLocaleOrder(found,activeLocaleOrder,f=>f.locale);
      }
      async function publish(){
        if(disposed)return;title();
        const config=vscode.workspace.getConfiguration('bundleBridge',configUri);
        activeLocaleOrder=readLocaleOrder(configUri);
        const ordered=sortFilesByLocaleOrder(files,activeLocaleOrder,f=>f.locale);
        const base=ordered.map(f=>({filename:f.filename,locale:f.locale,values:values(f.model),duplicates:f.duplicates,duplicateCounts:f.duplicateCounts}));
        await panel.webview.postMessage({type:'state',name:name.base,files:base,draft,localeOrder:activeLocaleOrder,separator:config.get('groupSeparator','.')});
      }
      async function refresh(){await discover();await publish();}
      function beginDraft(){if(!draft)draft={original:Object.fromEntries(files.map(f=>[f.filename,f.doc.getText()])),values:Object.fromEntries(files.map(f=>[f.filename,values(f.model)])),comments:Object.fromEntries(files.map(f=>[f.filename,Object.fromEntries(f.model.entries.map(e=>[e.key,e.comments]))]))};}
      function keys(){return [...new Set(Object.values(draft?.values||Object.fromEntries(files.map(f=>[f.filename,values(f.model)]))).flatMap(v=>Object.keys(v)))];}
      async function reportPanelError(e){
        const text=e.message||String(e);
        const showLog=!!e.bundleBridgeLogged;
        if(!disposed)await panel.webview.postMessage({type:'error',text,showLog});
        if(showLog){
          const pick=await vscode.window.showErrorMessage(text,'View log');
          if(pick==='View log')showBundleLog();
        }else vscode.window.showErrorMessage(text);
      }
      async function handle(m){
        if(!m||typeof m.type!=='string')return;
        if(m.type==='showLog')return showBundleLog();
        if(m.type==='ready')return refresh();
        if(m.type==='settings')return vscode.commands.executeCommand('workbench.action.openSettings','@ext:timesheets.bundlebridge');
        if(m.type==='localeOrder')return vscode.commands.executeCommand('workbench.action.openSettings','@ext:timesheets.bundlebridge bundleBridge.'+localeOrderSettingKey());
        if(m.type==='source'){const f=files.find(f=>f.filename===m.file);if(f)await vscode.window.showTextDocument(f.doc,{preview:false});return;}
        if(m.type==='copy'){if(typeof m.key==='string')await vscode.env.clipboard.writeText(m.key);return;}
        if(m.type==='edit'){
          if(typeof m.key!=='string'||typeof m.value!=='string'||!files.some(f=>f.filename===m.file))return;
          beginDraft();Object.defineProperty(draft.values[m.file],m.key,{value:m.value,writable:true,enumerable:true,configurable:true});await persist();title();return;
        }
        if(['add','duplicate','rename'].includes(m.type)){
          if(m.type!=='add'&&!keys().includes(m.key))return;
          const key=await vscode.window.showInputBox({title:m.type==='add'?'Add key':m.type==='duplicate'?'Duplicate key and all translations':'Rename key in all locales',value:m.type==='add'?'':m.key,validateInput:k=>!k.trim()?'Enter a key':keys().includes(k)?'This key already exists':null});
          if(key===undefined)return;beginDraft();for(const v of Object.values(draft.values)){
            if(m.type==='add'||Object.hasOwn(v,m.key))Object.defineProperty(v,key,{value:m.type==='add'?'':v[m.key],writable:true,enumerable:true,configurable:true});
            if(m.type==='rename')delete v[m.key];
          }
          for(const comments of Object.values(draft.comments||{})){if(Object.hasOwn(comments,m.key))Object.defineProperty(comments,key,{value:comments[m.key],writable:true,enumerable:true,configurable:true});if(m.type==='rename')delete comments[m.key];}
          await persist();await publish();await panel.webview.postMessage({type:'select',key});return;
        }
        if(m.type==='delete'){
          if(!keys().includes(m.key))return;
          if(await vscode.window.showWarningMessage('Delete “'+m.key+'” from all locales?',{modal:true},'Delete')!=='Delete')return;
          beginDraft();for(const v of Object.values(draft.values))delete v[m.key];await persist();return publish();
        }
        if(m.type==='discard'){
          if(draft&&await vscode.window.showWarningMessage('Discard all pending bundle edits?',{modal:true},'Discard')!=='Discard')return;
          draft=undefined;await persist();return refresh();
        }
        if(m.type==='newLocale'){
          const filename=await promptAddLocale(files,name.base,folder,draft);
          if(!filename)return;
          await refresh();
          await panel.webview.postMessage({type:'notice',text:'Created '+filename+' by duplicating the selected locale file.'});
          return;
        }
        if(m.type==='save'||m.type==='format'){
          const operation=m.type;const hadDraft=!!draft;
          await discover(); if(!draft&&m.type==='save')return publish();
          if(files.some(f=>f.duplicates.length))throw Error('Duplicate keys exist in a source file. Resolve them in the source editor before saving this bundle.');
          if(draft){
            const current=files.map(f=>f.filename).sort(), original=Object.keys(draft.original).sort();
            if(JSON.stringify(current)!==JSON.stringify(original)||files.some(f=>f.doc.getText()!==draft.original[f.filename]))throw Error('Source files changed since editing began. Your draft is retained. Copy any needed translations, then discard the draft to load the latest source files.');
          }
          const config=vscode.workspace.getConfiguration('bundleBridge',configUri), options=Object.fromEntries(Object.keys(defaults).map(k=>[k,config.get(k,defaults[k])]));
          logLines(log,'info',`${operation} started`,{bundle:name.base,folder:folder.fsPath,files:files.map(f=>f.filename),hadDraft});
          const failures=[];let changedFiles=0;
          for(const f of files){let model=f.model;
            if(draft){const v=draft.values[f.filename];const old=new Map(model.entries.map(e=>[e.key,e]));model={...model,entries:Object.entries(v).map(([key,value])=>({key,value,comments:Array.isArray(draft.comments?.[f.filename]?.[key])?draft.comments[f.filename][key]:(old.get(key)?.comments||[])}))};}
            const output=format(model,options);
            const doc=await vscode.workspace.openTextDocument(f.doc.uri);
            const result=await replaceFullDocument(doc,output,log,`${operation} · ${f.filename}`);
            if(!result.ok)failures.push({filename:f.filename,reason:result.reason,method:result.method,diagnostics:result.diagnostics});
            else if(!result.skipped)changedFiles++;
          }
          if(failures.length){
            logLines(log,'error',`${operation} failed`,{bundle:name.base,failures});
            const err=new Error(summarizeApplyFailures(failures,operation)+(hadDraft?' Your bundle draft is retained.':''));
            err.bundleBridgeLogged=true;
            throw err;
          }
          // Changes now belong to native text documents, which retain unsaved edits if saving fails.
          if(hadDraft||operation==='save'){draft=undefined;await persist();}
          if(changedFiles){
            const saved=await Promise.all(files.map(f=>f.doc.save()));
            if(saved.some(s=>!s)){
              logLines(log,'error',`${operation} save failed`,{bundle:name.base,files:files.filter((f,i)=>!saved[i]).map(f=>f.filename)});
              const err=new Error('Some files could not be saved. Their changes remain in the source editor as unsaved edits.');
              err.bundleBridgeLogged=true;
              throw err;
            }
          }
          await refresh();
          const notice=operation==='format'?changedFiles?`Formatted ${changedFiles} locale file${changedFiles===1?'':'s'}.`:'All locale files already match your formatting settings.':'Bundle saved.';
          logLines(log,'info',`${operation} completed`,{bundle:name.base,changedFiles});
          await panel.webview.postMessage({type:'notice',text:notice});
        }
      }
      panel.webview.onDidReceiveMessage(m=>{chain=chain.then(()=>handle(m)).catch(e=>reportPanelError(e));},null,context.subscriptions);
      const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder,'*.properties'));
      const changed=()=>{chain=chain.then(refresh).catch(e=>{if(!disposed)panel.webview.postMessage({type:'error',text:e.message});});};
      watcher.onDidCreate(changed);watcher.onDidDelete(changed);watcher.onDidChange(changed);
      const changeDoc=vscode.workspace.onDidChangeTextDocument(e=>{if(files.some(f=>f.doc===e.document))changed();});
      const changeConfig=vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('bundleBridge.workspaceLocaleOrder')||e.affectsConfiguration('bundleBridge.userLocaleOrder'))chain=chain.then(refresh).catch(err=>{if(!disposed)panel.webview.postMessage({type:'error',text:err.message});});});
      panel.onDidDispose(()=>{disposed=true;panels.delete(id);watcher.dispose();changeDoc.dispose();changeConfig.dispose();});
      const nonce=crypto.randomBytes(24).toString('hex');const media=n=>panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media',n));
      panel.webview.html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${media('editor.css')}"></head><body>
      <header><div><span class="eyebrow">BUNDLEBRIDGE</span><h1 id="title">Loading…</h1></div><div class="actions"><button id="newLocale">Add locale…</button><button id="localeOrder">Locale order…</button><button id="settings">Settings</button><button id="format">Format files</button><button id="discard">Discard draft</button><button id="save" class="primary">Save bundle</button></div></header>
      <div id="notice" role="status" aria-live="polite"></div><main><aside><div class="search"><input id="search" type="search" placeholder="Search keys and translations" aria-label="Search keys and translations"><label><input id="missing" type="checkbox"> Missing translations only</label><label><input id="duplicates" type="checkbox"> Duplicate source keys only</label></div><div class="tree-toolbar"><span id="count"></span><button id="expand">Expand all</button><button id="collapse">Collapse all</button></div><nav id="tree" aria-label="Resource keys"></nav><button id="add" class="primary">＋ Add key</button></aside><section id="detail"><div class="keybar"><div><span class="eyebrow">SELECTED KEY</span><h2 id="key">Select a key</h2></div><div class="actions"><button id="copy">Copy key</button><button id="duplicate">Duplicate</button><button id="rename">Rename</button><button id="delete">Delete</button></div></div><div id="editors"></div></section></main><footer id="footer">Loading bundle…</footer><script nonce="${nonce}" src="${media('editor.js')}"></script></body></html>`;
    }catch(e){vscode.window.showErrorMessage(e.message);}
  }));
}
module.exports={activate,deactivate(){}};
