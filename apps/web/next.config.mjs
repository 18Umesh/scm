const contentPolicy="default-src 'self'; script-src 'self' https://checkout.razorpay.com 'unsafe-inline' 'wasm-unsafe-eval'"+(process.env.NODE_ENV==='development'? " 'unsafe-eval'":"")+"; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.razorpay.com ws://*.localhost:* ws://localhost:*; frame-src 'self' https://www.openstreetmap.org https://*.razorpay.com; worker-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const config = {
  poweredByHeader:false,devIndicators:false,
  async rewrites() { return [{source:'/student/:path*',destination:`${process.env.STUDENT_URL ?? `http://127.0.0.1:${process.env.STUDENT_PORT ?? '3001'}`}/student/:path*`}]; },
  async headers() { return [{source:'/:path*',headers:[
    {key:'X-Frame-Options',value:'DENY'}, {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'same-origin'}, {key:'X-Robots-Tag',value:'noindex, nofollow'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
    {key:'Content-Security-Policy',value:contentPolicy}
  ]},{source:'/',headers:[{key:'Permissions-Policy',value:'camera=(), microphone=(self), geolocation=(self), on-device-speech-recognition=(self)'}]},{source:'/',has:[{type:'query',key:'preview',value:'mobile'}],headers:[{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Content-Security-Policy',value:contentPolicy.replace("frame-ancestors 'none'","frame-ancestors 'self'")}]}]; }
};
export default config;
