import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {build as esbuild} from 'esbuild';
import {build as viteBuild} from 'vite';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const check=process.argv.includes('--check');
// Independently rebuild every deliverable from source. No baseline rewriting.
if(check){
  for(const [format,path] of [['esm','web/engine.mjs'],['iife','web/engine.js']]){
    const result=await esbuild({absWorkingDir:fileURLToPath(root),entryPoints:['engine/index.ts'],
      bundle:true,format,outfile:path,target:'es2020',write:false,
      ...(format==='iife'?{globalName:'TouhouChess'}:{})});
    if(result.outputFiles[0].text!==await read(path))throw Error(path+' is stale; run npm run build');
  }
}
// Vite compiles the Svelte app and inline Worker from the SAME TS imports.
const result=await viteBuild({configFile:fileURLToPath(new URL('vite.config.js',root)),
  logLevel:'warn',build:{write:false}});
const output=result.output;
let html=String(output.find(x=>x.fileName==='index.html').source);
for(const file of output){
  if(file.type==='chunk'&&file.isEntry){
    const tag=/<script\b[^>]*src="[^"]+"[^>]*><\/script>/;
    if(!tag.test(html))throw Error('Missing Vite entry');
    html=html.replace(tag,()=>'<script type="module">'+file.code.replaceAll('</script','<\\/script')+'</script>');
  }
  if(file.type==='asset'&&file.fileName.endsWith('.css')){
    html=html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/,()=>'<style>'+String(file.source)+'</style>');
  }
}
if(/(?:src|href)="\.\/assets\//.test(html))throw Error('Single-file output still contains external assets');
if(check){
  if(html!==await read('touhou-chess.html'))throw Error('HTML is stale or hand-edited; run npm run build');
  console.log('Single-source check passed: TS engine → Svelte app + inline Worker + standalone HTML.');
}else{
  await mkdir(new URL('web/dist/',root),{recursive:true});
  for(const file of output){
    const url=new URL('web/dist/'+file.fileName,root);
    await mkdir(new URL('./',url),{recursive:true});
    await writeFile(url,file.type==='chunk'?file.code:file.source);
  }
  await writeFile(new URL('touhou-chess.html',root),html);
  console.log('Built web/dist/ and touhou-chess.html from Svelte + shared TS engine.');
}
