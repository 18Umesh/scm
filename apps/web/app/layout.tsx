import type { Metadata } from 'next';
import './globals.css';
import './operations.css';
export const metadata: Metadata = {title:'Campus · School workspace',description:'A little less admin. A lot more school.',robots:{index:false,follow:false},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" suppressHydrationWarning><body>{children}</body></html>; }
