import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';

const WIDTH=960, HEIGHT=540, FPS=24;

function parseOptions(argv){
  const positional=[],options=new Map();
  for(let i=0;i<argv.length;i++){
    const item=argv[i];
    if(!item.startsWith('--')){positional.push(item);continue;}
    const equals=item.indexOf('=');
    if(equals>=0){options.set(item.slice(2,equals),item.slice(equals+1));continue;}
    const name=item.slice(2);
    if(['preview','stills'].includes(name)){options.set(name,true);continue;}
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error(`Missing value for --${name}`);
    options.set(name,argv[++i]);
  }
  return {positional,options};
}

function localServer(directory){
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.wav':'audio/wav'};
  return http.createServer((request,response)=>{
    if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}
    let target;
    try{target=path.resolve(directory,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));}
    catch{response.writeHead(400);response.end();return;}
    if(!target.startsWith(directory+path.sep)){response.writeHead(403);response.end();return;}
    fs.readFile(target,(error,data)=>{
      response.writeHead(error?404:200,{'content-type':types[path.extname(target)]||'application/octet-stream'});
      response.end(error?'Not found':data);
    });
  });
}

function writeFrame(stream,buffer){
  if(stream.destroyed) return Promise.reject(new Error('Encoder input is closed'));
  if(stream.write(buffer))return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{stream.off('drain',drain);stream.off('error',error);stream.off('close',close);};
    const drain=()=>{cleanup();resolve();};
    const error=value=>{cleanup();reject(value);};
    const close=()=>{cleanup();reject(new Error('Encoder closed before draining its input'));};
    stream.once('drain',drain);stream.once('error',error);stream.once('close',close);
  });
}

export async function runRender({baselinePath}={}){
  const {positional,options}=parseOptions(process.argv.slice(2));
  if(positional.length!==2)throw new Error('Usage: node render.mjs scene.html output.mp4 --duration=32 [--audio=music.wav] | scene.html still-directory --stills --times=0,4.5,18.5,24.8');
  if(options.has('fps')&&Number(options.get('fps'))!==FPS)throw new Error('This skill outputs 24 fps');
  const scenePath=path.resolve(positional[0]),directory=path.dirname(scenePath),output=path.resolve(positional[1]);
  const stills=options.has('stills'),from=Number(options.get('from')||0);
  const to=Number(options.get('to')||options.get('duration')||32);
  const times=String(options.get('times')||'0,4.5,18.5,24.8').split(',').map(Number);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from)throw new Error('Invalid output interval');
  if(stills&&times.some(time=>!Number.isFinite(time)||time<0))throw new Error('Invalid still times');
  const frames=stills?times.length:Math.round((to-from)*FPS);
  const partial=output+'.partial.mp4';
  if(!stills&&(fs.existsSync(output)||fs.existsSync(partial)))throw new Error('Output or partial output exists. Request the user’s decision before replacing it.');
  if(stills){
    fs.mkdirSync(output,{recursive:true});
    for(let i=0;i<frames;i++)if(fs.existsSync(path.join(output,`${String(i+1).padStart(2,'0')}.png`)))throw new Error('Still batch already exists. Request the user’s decision before another batch.');
  }else fs.mkdirSync(path.dirname(output),{recursive:true});
  const baselineFile=options.get('baseline')||baselinePath||new URL('../references/baseline.json',import.meta.url);
  const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8').replace(/^\uFEFF/,''));
  const require=createRequire(path.join(directory,'package.json'));
  const {chromium}=require('playwright');
  const chrome=options.get('chrome')||process.env.CHROME_PATH||path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe');
  const ffmpeg=process.env.FFMPEG||'ffmpeg';
  const metrics={status:'running',mode:stills?'stills':'video',width:WIDTH,height:HEIGHT,fps:FPS,requested_frames:frames,completed_frames:0,temporal_samples_per_frame:1,launch_args:['--use-angle=d3d11'],load_ms:0,render_ms:0,capture_ms:0,still_write_ms:0,encode_feed_wait_ms:0,encode_drain_ms:0,encoder_wall_ms:0,output_loop_ms:0,total_ms:0,errors:[]};
  const reportPath=stills?path.join(output,'timings.json'):output+'.timings.json';
  const started=performance.now();
  const server=localServer(directory);
  let browser,encoder,encoderDone,encoderStarted=0,encoderEnded=0,streamError;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const profile=path.join(directory,'work','render-profile');
    browser=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1,args:metrics.launch_args});
    const page=await browser.newPage();
    page.on('pageerror',error=>metrics.errors.push(error.message));
    const url=new URL(path.basename(scenePath),`http://127.0.0.1:${server.address().port}/`);
    url.searchParams.set('scale','1');
    await page.goto(url.href,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.READY)&&typeof window.render==='function',null,{timeout:90000});
    await page.evaluate(async()=>{await window.READY;await document.fonts.ready;const frame=document.querySelector('#frame');const canvas=frame?.querySelector('canvas')||document.querySelector('canvas');if(!canvas)throw Error('Missing canvas');if(canvas.width!==960||canvas.height!==540)throw Error('Scene framebuffer must be 960 x 540');if(frame){frame.style.width='960px';frame.style.height='540px';}canvas.style.width='960px';canvas.style.height='540px';});
    metrics.scene=await page.evaluate(()=>{
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      const extension=gl?.getExtension('WEBGL_debug_renderer_info');
      return {framebuffer:[canvas.width,canvas.height],devicePixelRatio:devicePixelRatio,renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),benchmarkCase:window.BENCHMARK_SCENE_KEY||null,loop:!!window.MATCH_LOOP_END};
    });
    const cdp=await page.context().newCDPSession(page);
    metrics.load_ms=performance.now()-started;
    console.log(`[加载] ${(metrics.load_ms/1000).toFixed(3)} s  ${metrics.scene.renderer}`);
    const loopStarted=performance.now();
    if(!stills){
      const args=['-n','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-i','pipe:0'];
      const audio=options.get('audio');
      if(audio){args.push('-i',path.resolve(audio));if(from)args.push('-af',`atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS`);}
      args.push('-map','0:v:0');if(audio)args.push('-map','1:a:0');
      args.push('-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-r',String(FPS));
      if(audio)args.push('-c:a','aac','-b:a','128k');
      args.push('-t',String(to-from),'-frames:v',String(frames),'-movflags','+faststart',partial);
      encoderStarted=performance.now();
      encoder=spawn(ffmpeg,args,{windowsHide:true,stdio:['pipe','ignore','inherit']});
      encoder.stdin.on('error',error=>{streamError=error;});
      encoderDone=new Promise(resolve=>{encoder.once('error',error=>resolve({error}));encoder.once('close',code=>{encoderEnded=performance.now();resolve({code});});});
    }
    for(let index=0;index<frames;index++){
      if(streamError)throw streamError;
      if(metrics.errors.length)throw new Error(metrics.errors.join('\n'));
      let ms=stills?times[index]*1000:(from+index/FPS)*1000;
      if(!stills&&metrics.scene.loop&&index===frames-1)ms=to*1000;
      let mark=performance.now();
      await page.evaluate(ms=>window.render(ms),ms);
      metrics.render_ms+=performance.now()-mark;
      mark=performance.now();
      const {data}=await cdp.send('Page.captureScreenshot',{format:stills?'png':'jpeg',...(stills?{}:{quality:92}),clip:{x:0,y:0,width:WIDTH,height:HEIGHT,scale:1},captureBeyondViewport:false});
      const buffer=Buffer.from(data,'base64');
      metrics.capture_ms+=performance.now()-mark;
      mark=performance.now();
      if(stills){fs.writeFileSync(path.join(output,`${String(index+1).padStart(2,'0')}.png`),buffer);metrics.still_write_ms+=performance.now()-mark;}
      else{await writeFrame(encoder.stdin,buffer);metrics.encode_feed_wait_ms+=performance.now()-mark;}
      metrics.completed_frames++;
      if(index%48===0||index===frames-1)console.log(`[进度] ${index+1}/${frames}  出帧 ${(metrics.render_ms/1000).toFixed(2)} s  抓帧 ${(metrics.capture_ms/1000).toFixed(2)} s  编码管道等待 ${(metrics.encode_feed_wait_ms/1000).toFixed(2)} s`);
    }
    if(encoder){
      const mark=performance.now();encoder.stdin.end();
      const result=await encoderDone;
      metrics.encode_drain_ms=performance.now()-mark;
      metrics.encoder_wall_ms=(encoderEnded||performance.now())-encoderStarted;
      if(result.error)throw result.error;
      if(result.code!==0)throw new Error(`Encoder exited ${result.code}`);
      fs.renameSync(partial,output);
    }
    metrics.output_loop_ms=performance.now()-loopStarted;
    metrics.total_ms=performance.now()-started;
    metrics.mean_loop_seconds_per_frame=metrics.output_loop_ms/1000/frames;
    metrics.mean_total_seconds_per_frame=metrics.total_ms/1000/frames;
    const caseName=options.get('case')||metrics.scene.benchmarkCase;
    if(!stills&&caseName===baseline.case&&frames===baseline.frames&&from===0&&FPS===baseline.fps){
      metrics.baseline_comparison={historical_seconds_per_frame_approx:baseline.mean_loop_seconds_per_frame_approx,new_seconds_per_frame:metrics.mean_loop_seconds_per_frame,approx_speedup:baseline.mean_loop_seconds_per_frame_approx/metrics.mean_loop_seconds_per_frame,quality_changes:['D3D11','1024 shadow map','single temporal sample'],historical_elapsed_is_rounded:true};
    }
    metrics.status='complete';
  }catch(error){metrics.status='failed';metrics.errors.push(error.message);throw error;
  }finally{
    if(encoder&&encoder.exitCode===null&&encoder.signalCode===null){encoder.kill();await encoderDone;}
    metrics.total_ms ||= performance.now()-started;
    fs.writeFileSync(reportPath,JSON.stringify(metrics,null,2));
    if(stills)console.log(`[静帧写盘] ${(metrics.still_write_ms/1000).toFixed(3)} s`);
    console.log(`[出帧] ${(metrics.render_ms/1000).toFixed(3)} s`);
    console.log(`[抓帧] ${(metrics.capture_ms/1000).toFixed(3)} s`);
    console.log(`[编码] 管道等待 ${(metrics.encode_feed_wait_ms/1000).toFixed(3)} s  收尾 ${(metrics.encode_drain_ms/1000).toFixed(3)} s  进程墙钟 ${(metrics.encoder_wall_ms/1000).toFixed(3)} s（与出帧、抓帧重叠）`);
    console.log(`[总计] ${(metrics.total_ms/1000).toFixed(3)} s  ${metrics.completed_frames} 帧  循环均值 ${metrics.mean_loop_seconds_per_frame?.toFixed(6)||'未完成'} s/帧`);
    if(metrics.baseline_comparison)console.log(`[基准对比] 约 ${metrics.baseline_comparison.approx_speedup.toFixed(2)} 倍`);
    console.log(`[计时文件] ${reportPath}`);
    if(browser)await browser.close();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
  }
  return metrics;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  await runRender();
}
