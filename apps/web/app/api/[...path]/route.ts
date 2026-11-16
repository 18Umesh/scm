import { type NextRequest } from 'next/server';
import { request } from 'node:http';
import { request as httpsRequest } from 'node:https';
export const dynamic = 'force-dynamic';
async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const target = new URL(url.pathname+url.search,process.env.API_URL ?? 'http://127.0.0.1:4000');
  const headers: Record<string,string> = {};
  // The browser cannot set Host. Do not trust user-supplied X-Forwarded-Host.
  headers.host=req.headers.get('host') ?? '';
  for (const key of ['cookie','content-type','origin','x-csrf-token','x-razorpay-signature','x-razorpay-event-id']) { const value = req.headers.get(key); if (value) headers[key]=value; }
  try {
    const body=['GET','HEAD'].includes(req.method)?undefined:await req.text();
    if (body && Buffer.byteLength(body)>12*1024*1024) return Response.json({code:'invalidInput'},{status:413});
    return await new Promise<Response>((resolve,reject)=> {
      const upstream=(target.protocol==='https:'?httpsRequest:request)(target,{method:req.method,headers,signal:AbortSignal.timeout(url.pathname==='/api/operations/teacher/lms/generate'||url.pathname==='/api/operations/teacher/post'||url.pathname.startsWith('/api/operations/files')?120000:20000)},res=> {
        const outgoing=new Headers({'Content-Type':res.headers['content-type']??'application/json','Cache-Control':'no-store'});
        if(res.headers['content-disposition'])outgoing.set('Content-Disposition',res.headers['content-disposition']);
        for(const cookie of res.headers['set-cookie'] ?? []) outgoing.append('set-cookie',cookie);
        const chunks:Buffer[]=[]; res.on('data',chunk=>chunks.push(chunk)); res.on('error',reject);
        res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:outgoing})));
      }); upstream.on('error',reject); if(body) upstream.write(body); upstream.end();
    });
  } catch { return Response.json({code:'serverError'},{status:503}); }
}
export {proxy as GET,proxy as POST,proxy as PUT,proxy as DELETE};
