import type { Metadata } from 'next';
export const metadata:Metadata={title:'Campus · Student',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body style={{margin:0,fontFamily:'system-ui,sans-serif',background:'#eef2f7',color:'#17233b'}}>{children}</body></html>;}
