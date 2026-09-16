'use strict';
const vscode=require('vscode');
let outputChannel;
function bundleLog(context){
  if(!outputChannel){
    outputChannel=vscode.window.createOutputChannel('BundleBridge');
    if(context)context.subscriptions.push(outputChannel);
  }
  return outputChannel;
}
function showBundleLog(){
  if(outputChannel)outputChannel.show(true);
}
function logLines(log,level,title,details){
  log.appendLine(`${new Date().toISOString()} [${level}] ${title}`);
  if(details==null)return;
  const body=typeof details==='string'?details:JSON.stringify(details,null,2);
  for(const line of body.split('\n'))log.appendLine('  '+line);
}
module.exports={bundleLog,showBundleLog,logLines};
