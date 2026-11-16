import {z} from 'zod';
export const postFileSchema=z.object({filename:z.string().trim().min(1).max(150),fileBase64:z.string().min(1).max(9*1024*1024)}).strict();
export const schoolFileLinkSchema=z.object({name:z.string().trim().min(1).max(150),url:z.string().url().max(2000).refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;},'Use an HTTPS file link without embedded credentials.')}).strict();
const driveConfig=z.object({provider:z.literal('google-drive'),folderId:z.string().regex(/^[a-zA-Z0-9_-]+$/),clientId:z.string().min(1),clientSecret:z.string().min(1),refreshToken:z.string().min(1)}).strict();
export function schoolDriveConfig(schoolId:string){try{const result=driveConfig.safeParse(JSON.parse(process.env.SCHOOL_FILE_STORES??'{}')[schoolId]);return result.success?result.data:undefined;}catch{return undefined;}}
export function postUploadsEnabled(schoolId:string){const mode=process.env.POST_ATTACHMENT_STORAGE;if(mode==='links-only')return false;if(mode==='local')return true;if(mode==='school-drive'||process.env.NODE_ENV==='production')return!!schoolDriveConfig(schoolId);return true;}
