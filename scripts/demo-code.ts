import{totp}from'../packages/auth';
import{NETAJI}from'../packages/demo/netaji';
const remaining=30-Math.floor(Date.now()/1000)%30;
console.log(`Netaji local demo authenticator code: ${totp(NETAJI.totpSecret)} (${remaining}s remaining)`);
console.log('For principal@netaji.school and accounts@netaji.school only. Not a production credential.');
