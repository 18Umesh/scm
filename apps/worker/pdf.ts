import{chromium}from '@playwright/test';
import{readFile}from 'node:fs/promises';
export async function renderPdf(html:string,language='en'){
 const family=language==='te'?'anek-telugu':language==='hi'?'anek-devanagari':'anek-latin';
 const font=await readFile(`apps/web/public/fonts/${family}.woff2`);
 const style=`<style>@font-face{font-family:SchoolDocument;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2')}body{font-family:SchoolDocument,system-ui!important}</style>`;
 const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await page.route('**/*',route=>route.abort());await page.setContent(html.replace('</head>',style+'</head>'),{waitUntil:'load',timeout:15000});await page.evaluate(()=>document.fonts.ready);return await page.pdf({format:'A4',printBackground:true,margin:{top:'18mm',bottom:'18mm',left:'14mm',right:'14mm'}});}finally{await browser.close();}
}
