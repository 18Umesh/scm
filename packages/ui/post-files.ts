export const POST_FILE_LIMIT=5;
export const POST_TOTAL_BYTES=6*1024*1024;
export const POST_FILE_ACCEPT='.pdf,.docx,.xlsx,.pptx,.txt,.csv,image/jpeg,image/png,image/webp';
export async function encodePostFiles(files:File[]){return Promise.all(files.map(async file=>{const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return{filename:file.name,fileBase64:btoa(raw)};}));}
