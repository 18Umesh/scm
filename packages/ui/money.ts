export function formatPaise(value:string|bigint,language='en'){
 const amount=BigInt(value);const absolute=amount<0n?-amount:amount;const locale=language==='te'?'te-IN':language==='hi'?'hi-IN':'en-IN';
 const whole=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(absolute/100n);const paise=(absolute%100n).toString().padStart(2,'0');
 return `${amount<0n?'-':''}₹${whole}.${paise}`;
}
