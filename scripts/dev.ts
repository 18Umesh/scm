import 'dotenv/config';
import {spawn,type ChildProcess} from 'node:child_process';
import {watch,type FSWatcher} from 'node:fs';
import {resolve} from 'node:path';
// API reloads use IPC so the embedded database closes before the next writer starts.
let stopping=false,restarting=false;
let api:ChildProcess;
const watchers:FSWatcher[]=[];
let debounce:ReturnType<typeof setTimeout>|undefined;
const websites=[
 spawn(process.execPath,[resolve('apps/web/node_modules/next/dist/bin/next'),'dev','--hostname','0.0.0.0','--port',process.env.WEB_PORT??'3000'],{cwd:resolve('apps/web'),stdio:'inherit',env:process.env}),
 spawn(process.execPath,[resolve('apps/student/node_modules/next/dist/bin/next'),'dev','--hostname','0.0.0.0','--port',process.env.STUDENT_PORT??'3001'],{cwd:resolve('apps/student'),stdio:'inherit',env:process.env})
];
function stop(){
 if(stopping)return;stopping=true;if(debounce)clearTimeout(debounce);for(const watcher of watchers)watcher.close();
 if(api?.connected)api.send('campus:shutdown');
 for(const child of websites)child.kill('SIGTERM');
}
function startApi(){
 api=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{stdio:['inherit','inherit','inherit','ipc'],env:process.env});
 api.on('error',error=>{console.error(error.message);process.exitCode=1;stop();});
 api.on('exit',code=>{if(restarting&&!stopping){restarting=false;startApi();}else if(!stopping){process.exitCode=code??1;stop();}});
}
function restart(){
 if(stopping||restarting||!api.connected)return;restarting=true;
 console.log('Reloading API after closing the database...');api.send('campus:shutdown');
}
startApi();
for(const directory of ['apps/api/src','packages'])watchers.push(watch(resolve(directory),{recursive:true},(_event,file)=>{
 if(!file||! /\.(ts|sql)$/.test(String(file)))return;if(debounce)clearTimeout(debounce);debounce=setTimeout(restart,400);
}));
for(const child of websites)child.on('exit',code=>{if(!stopping){process.exitCode=code??1;stop();}});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
