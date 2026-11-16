import'dotenv/config';
import express from'express';
import{mkdir}from'node:fs/promises';
import{AdsService,adminTokenValid}from'./service';
import{RateLimiter}from'../../../packages/auth';
async function main(){await mkdir('.data',{recursive:true});const service=await AdsService.create();const app=express();const limiter=new RateLimiter();app.disable('x-powered-by');app.use(express.json({limit:'16kb'}));
 app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!limiter.take(req.socket.remoteAddress??'local',120))return res.status(429).json({code:'rateLimited'});next();});
 app.post('/serve',async(req,res)=>{try{return res.json({ad:await service.serve(req.body)});}catch{return res.status(400).json({code:'invalidInput'});}});
 app.post('/metrics',async(req,res)=>{try{return res.json(await service.metric(req.body));}catch{return res.status(400).json({code:'invalidInput'});}});
 app.post('/enquiries',async(req,res)=>{try{return res.json(await service.enquiry(req.body));}catch{return res.status(400).json({code:'invalidInput'});}});
 app.use('/admin',(req,res,next)=>{if(!adminTokenValid(req.headers.authorization?.replace(/^Bearer /,'')??''))return res.status(403).json({code:'forbidden'});next();});
 app.get('/admin/campaigns',async(req,res)=>{try{return res.json(await service.list(req.query));}catch{return res.status(400).json({code:'invalidInput'});}});
 app.post('/admin/campaigns',async(req,res)=>{try{return res.json(await service.createCampaign(req.body));}catch{return res.status(400).json({code:'invalidInput'});}});
 app.post('/admin/review',async(req,res)=>{try{return res.json(await service.review(req.body));}catch{return res.status(400).json({code:'invalidInput'});}});
 app.listen(Number(process.env.ADS_PORT??4010),'127.0.0.1',()=>console.log('Isolated ads service ready'));
}
main().catch(()=>{console.error('Ads service startup failed');process.exit(1);});
