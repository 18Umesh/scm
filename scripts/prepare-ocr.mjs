/* global fetch, console */
import{Buffer}from 'node:buffer';
import {createRequire} from 'node:module';
import {mkdir,copyFile,readdir,writeFile,readFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const require=createRequire(resolve('apps/web/package.json'));
const workerRoot=dirname(require.resolve('tesseract.js/package.json'));
const coreRoot=dirname(createRequire(join(workerRoot,'package.json')).resolve('tesseract.js-core/package.json'));
const target=resolve('apps/web/public/ocr');
await mkdir(join(target,'core'),{recursive:true});await mkdir(join(target,'lang'),{recursive:true});
await copyFile(join(workerRoot,'dist/worker.min.js'),join(target,'worker.min.js'));
for(const name of await readdir(coreRoot))if(/^tesseract-core.*\.wasm(?:\.js)?$/.test(name))await copyFile(join(coreRoot,name),join(target,'core',name));
await copyFile(join(workerRoot,'LICENSE.md'),join(target,'TESSERACT-JS-LICENSE.md'));
for(const name of await readdir(coreRoot))if(/^license/i.test(name))await copyFile(join(coreRoot,name),join(target,'TESSERACT-CORE-'+name));
const revision='87416418657359cb625c412a48b6e1d6d41c29bd';const manifest={revision,languages:{}};
for(const lang of ['eng','hin','tel']){
 const path=join(target,'lang',lang+'.traineddata.gz');let data;
 try{data=await readFile(path);}catch{const response=await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${revision}/${lang}.traineddata`);if(!response.ok)throw new Error('Language pack download failed: '+lang);data=gzipSync(Buffer.from(await response.arrayBuffer()));await writeFile(path,data);}
 manifest.languages[lang]={sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length};
}
const license=await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${revision}/LICENSE`);if(!license.ok)throw new Error('OCR license download failed');await writeFile(join(target,'TESSDATA-LICENSE'),await license.text());
await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Self-hosted OCR worker, WASM and English/Hindi/Telugu packs ready.');
