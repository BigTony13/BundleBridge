'use strict';
const vscode=require('vscode');

function documentDiagnostics(doc){
  const folder=vscode.workspace.getWorkspaceFolder(doc.uri);
  return {
    uri:doc.uri.toString(),
    fsPath:doc.uri.fsPath,
    scheme:doc.uri.scheme,
    languageId:doc.languageId,
    version:doc.version,
    isDirty:doc.isDirty,
    isClosed:doc.isClosed,
    lineCount:doc.lineCount,
    length:doc.getText().length,
    inWorkspace:!!folder,
    workspaceFolder:folder?.uri.fsPath,
    openEditors:vscode.window.visibleTextEditors.filter(te=>te.document.uri.toString()===doc.uri.toString()).map(te=>({viewColumn:te.viewColumn,isDirty:te.document.isDirty,isActive:te===vscode.window.activeTextEditor})),
  };
}
function fullDocumentRange(doc){
  const text=doc.getText();
  return new vscode.Range(doc.positionAt(0),doc.positionAt(text.length));
}
function guessFailureReason(meta){
  if(meta.fsWriteError)return 'Writing the file failed: '+meta.fsWriteError;
  if(!meta.inWorkspace)return 'File is outside the workspace folder and VS Code blocked the edit.';
  if(meta.openEditors?.some(e=>e.isDirty))return 'A source editor tab has unsaved changes that blocked replacing the file contents.';
  if(meta.isDirty)return 'The properties file has unsaved changes that blocked this edit.';
  if(meta.isClosed)return 'The properties document was closed before the edit could be applied.';
  return 'VS Code rejected the workspace edit.';
}
async function replaceFullDocument(doc,output,log,contextLabel){
  const before=doc.getText();
  if(output===before)return {ok:true,skipped:true,method:'unchanged',diagnostics:documentDiagnostics(doc)};
  const meta={context:contextLabel,...documentDiagnostics(doc),beforeLength:before.length,afterLength:output.length};
  const range=fullDocumentRange(doc);
  const workspaceEdit=new vscode.WorkspaceEdit();
  workspaceEdit.replace(doc.uri,range,output);
  if(await vscode.workspace.applyEdit(workspaceEdit)){
    if(log)log.appendLine(`${contextLabel}: workspaceEdit ok — ${doc.uri.fsPath}`);
    return {ok:true,skipped:false,method:'workspaceEdit',diagnostics:meta};
  }
  const editor=vscode.window.visibleTextEditors.find(te=>te.document.uri.toString()===doc.uri.toString());
  if(editor){
    const editorRange=fullDocumentRange(editor.document);
    if(await editor.edit(b=>b.replace(editorRange,output))){
      if(log)log.appendLine(`${contextLabel}: textEditor.edit ok — ${doc.uri.fsPath}`);
      return {ok:true,skipped:false,method:'textEditor',diagnostics:meta};
    }
    meta.textEditorEditFailed=true;
  }
  const fresh=await vscode.workspace.openTextDocument(doc.uri);
  if(fresh.getText()!==before)meta.retryNote='document text changed between apply attempts';
  const retryEdit=new vscode.WorkspaceEdit();
  retryEdit.replace(fresh.uri,fullDocumentRange(fresh),output);
  if(await vscode.workspace.applyEdit(retryEdit)){
    if(log)log.appendLine(`${contextLabel}: workspaceEdit retry ok — ${doc.uri.fsPath}`);
    return {ok:true,skipped:false,method:'workspaceEditRetry',diagnostics:meta};
  }
  if(!meta.inWorkspace){
    try{
      await vscode.workspace.fs.writeFile(doc.uri,new TextEncoder().encode(output));
      if(log)log.appendLine(`${contextLabel}: fs.writeFile ok (outside workspace) — ${doc.uri.fsPath}`);
      return {ok:true,skipped:false,method:'fsWrite',diagnostics:meta};
    }catch(e){
      meta.fsWriteError=e.message;
    }
  }
  const reason=guessFailureReason(meta);
  if(log)log.appendLine(`${contextLabel}: failed — ${doc.uri.fsPath} — ${reason}`);
  return {ok:false,skipped:false,method:'failed',reason,diagnostics:meta};
}
function summarizeApplyFailures(failures,operation){
  const label=operation==='format'?'formatting':'save';
  const names=failures.map(f=>f.filename).filter(Boolean);
  let msg=names.length===1?`Could not apply ${label} changes to ${names[0]}.`:names.length?`Could not apply ${label} changes to ${names.length} locale files.`:`Could not apply ${label} changes.`;
  const reasons=[...new Set(failures.map(f=>f.reason).filter(Boolean))];
  if(reasons.length)msg+=' '+reasons[0];
  return msg+' View the BundleBridge diagnostic log for per-file details.';
}
module.exports={replaceFullDocument,documentDiagnostics,summarizeApplyFailures};
