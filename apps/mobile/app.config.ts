import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {ConfigContext,ExpoConfig} from 'expo/config';

// Public branding only. Store signing credentials never enter the app manifest.
export default ({config}:ConfigContext):ExpoConfig=>{
 const path=process.env.SCHOOL_APP_MANIFEST_PATH;if(!path)return config as ExpoConfig;
 const manifest=JSON.parse(readFileSync(resolve(path),'utf8'));
 if(manifest.schemaVersion!==1||!/^[-a-f0-9]{36}$/i.test(manifest.schoolId)||manifest.applicationId!==`app.campus.school${manifest.schoolId.replaceAll('-','')}`||!['expressive','lavender','blue','minimal'].includes(manifest.design?.preset)||!Number.isInteger(manifest.brandVersion))throw new Error('Invalid school app build manifest');
 const origin=process.env.SCHOOL_API_ORIGIN??manifest.apiOrigin;
 if(origin&&!/^https:\/\/[^/]+$|^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin))throw new Error('School API origin must use HTTPS');
 return{...config,name:manifest.name,slug:'school-'+manifest.schoolId.replaceAll('-',''),scheme:'school'+manifest.schoolId.replaceAll('-',''),ios:{...config.ios,bundleIdentifier:manifest.applicationId},android:{...config.android,package:manifest.applicationId},...(process.env.SCHOOL_APP_ICON_PATH?{icon:resolve(process.env.SCHOOL_APP_ICON_PATH)}:{}),extra:{...config.extra,schoolId:manifest.schoolId,brandVersion:manifest.brandVersion,schoolDesign:manifest.design,...(origin?{apiOrigin:origin}:{})}};
};
