import { mkdir,writeFile } from 'node:fs/promises';
async function main() {
  const dir='apps/web/public/fonts';await mkdir(dir,{recursive:true});
  for (const [family,file] of [['Anek Latin','anek-latin'],['Anek Telugu','anek-telugu'],['Anek Devanagari','anek-devanagari']]) {
    const response=await fetch(`https://fonts.googleapis.com/css2?family=${family.replaceAll(' ','+')}:wght@100..800&display=swap`,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}});
    const css=await response.text();const urls=[...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m=>m[1]);
    if(!urls.length)throw new Error(`No font file for ${family}`);
    // Keep each language subset locally. Latin font uses the last (latin) subset.
    const url=family==='Anek Latin'?urls.at(-1)!:urls[0];
    const font=await fetch(url);if(!font.ok)throw new Error(`Font download failed: ${family}`);
    await writeFile(`${dir}/${file}.woff2`,Buffer.from(await font.arrayBuffer()));
    const license=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.toLowerCase().replaceAll(' ','')}/OFL.txt`);
    if(!license.ok)throw new Error('Font license unavailable');await writeFile(`${dir}/${file}-OFL.txt`,await license.text());
    console.log(`Downloaded ${family} for local serving`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
