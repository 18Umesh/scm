import 'reflect-metadata';
import { Module, Controller, All, Req, Res, Inject } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { json } from 'express';
import { CampusService } from './service';
import type { Database } from '../../../packages/db';
@Controller('api')
class ApiController {
  constructor(@Inject(CampusService) private readonly service: CampusService) {}
  @All('{*path}') handle(@Req() req: Request,@Res() res: Response) { return this.service.handle(req,res); }
}
export async function createApp(db: Database) {
  @Module({controllers:[ApiController],providers:[{provide:CampusService,useValue:new CampusService(db)}]})
  class AppModule {}
  const app = await NestFactory.create(AppModule,{logger:false,bodyParser:false});
  app.use(json({limit:'12mb',verify:(req,_res,buffer)=>{(req as Request & {rawBody:Buffer}).rawBody=Buffer.from(buffer);}}));
  app.enableShutdownHooks();
  await app.init();
  return app;
}
