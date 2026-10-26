<script>
  let {game,snapshot}= $props();
  let text=$state(''),message=$state(''),error=$state(false);
  const label=(zh,en)=>snapshot.lang==='zh'?zh:en;
  function importText(){
    try{const warnings=game.importPGN(text);error=false;
      message=warnings.length?label('已导入主线；注释、评注符号和变例未保留。','Mainline imported; comments, annotations and variations omitted.'):
        label('导入成功。前后翻阅局面，并打开引擎评估即可分析。','Imported. Browse moves and enable engine evaluation to analyse.');
    }catch(e){error=true;message=e.message;}
  }
  async function readFile(event){
    const input=event.currentTarget,file=input.files?.[0];if(!file)return;
    if(file.size>2_000_000){error=true;message=label('文件超过 2 MB。','File exceeds 2 MB.');return;}
    try{text=await file.text();importText();}catch(e){error=true;message=e.message;}
    input.value='';
  }
  function download(){
    try{
      text=game.exportPGN();const url=URL.createObjectURL(new Blob([text],{type:'application/x-chess-pgn;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='touhou-chess.pgn';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);error=false;message=label('棋谱已导出。','PGN exported.');
    }catch(e){error=true;message=e.message;}
  }
</script>
<details class="mt-3 border-t border-line pt-2 text-[13px]">
  <summary class="cursor-pointer">{label('棋谱导入 / 导出（PGN）','Import / export PGN')}</summary>
  <p class="my-2 text-muted">{label('每次导入一局主线。导入会替换当前棋局；从历史局面走棋会替换后续走法。','Import one mainline at a time. Import replaces the current game; playing from history replaces later moves.')}</p>
  <textarea class="w-full min-h-28 box-border border border-line bg-paper p-2 font-mono text-ink" aria-label="PGN" bind:value={text} placeholder="1. e4 e5 2. Nf3 Nc6 *"></textarea>
  <div class="flex flex-wrap gap-2 my-2">
    <button class="control" onclick={importText} disabled={!text.trim()}>{label('导入文本','Import text')}</button>
    <button class="control" onclick={download} disabled={!snapshot.record}>{label('导出 PGN','Export PGN')}</button>
    <input type="file" accept=".pgn,text/plain,application/x-chess-pgn" aria-label={label('选择棋谱文件','Choose PGN file')} onchange={readFile}/>
  </div>
  {#if message}<p class:text-shu={error} role="status">{message}</p>{/if}
</details>
{#if snapshot.phase==='play' && snapshot.record}
  <div class="flex items-center gap-2 mt-2 text-[13px]">
    <button class="control" disabled={snapshot.cursor===0} onclick={()=>game.seek(0)} aria-label={label('初始局面','Initial position')}>|‹</button>
    <button class="control" disabled={snapshot.cursor===0} onclick={()=>game.seek(snapshot.cursor-1)} aria-label={label('上一步','Previous move')}>‹</button>
    <span class="whitespace-nowrap tabular-nums">{snapshot.cursor} / {snapshot.record.moves.length} ply</span>
    <button class="control" disabled={snapshot.cursor===snapshot.record.moves.length} onclick={()=>game.seek(snapshot.cursor+1)} aria-label={label('下一步','Next move')}>›</button>
    <button class="control" disabled={snapshot.cursor===snapshot.record.moves.length} onclick={()=>game.seek(snapshot.record.moves.length)} aria-label={label('最终局面','Final position')}>›|</button>
  </div>
{/if}
