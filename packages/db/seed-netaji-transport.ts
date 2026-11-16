import type {Database} from './index';
import {id,hashPassword} from '../auth';
import {NETAJI} from '../demo/netaji';
import {Operations,type Actor} from '../operations/service';
import {Transport} from '../operations/transport';
export async function seedNetajiTransport(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Transport examples are local-only.');
 const schoolId=NETAJI.schoolId,driver=NETAJI.accounts.find(a=>a.role==='driver')!,principal=NETAJI.accounts.find(a=>a.role==='principal')!;
 await db.admin.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[driver.id,driver.email,driver.name,hashPassword(NETAJI.password)]);
 if(!(await db.admin.query("SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='driver'",[schoolId,driver.id])).rows.length)await db.admin.query("INSERT INTO memberships(id,school_id,user_id,role,scope,created_by) VALUES($1,$2,$3,'driver','{}',$4)",[id(),schoolId,driver.id,principal.id]);
 if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.transportReady'",[schoolId])).rows.length)return;
 const membership=(await db.admin.query("SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='principal'",[schoolId,principal.id])).rows[0];const ctx:Actor={schoolId,userId:principal.id,membershipId:membership.id,role:'principal'},ops=new Operations(db),transport=new Transport(db,ops);
 const students=(await db.admin.query("SELECT * FROM students WHERE school_id=$1 AND deleted_at IS NULL ORDER BY payload->>'admissionNumber'",[schoolId])).rows;
 const priya=NETAJI.accounts.find(a=>a.email==='priya@netaji.school')!;const second=students.find(s=>s.payload.name==='Diya Menon');
 if(second&&!(await db.admin.query('SELECT id FROM guardians WHERE school_id=$1 AND owner_id=$2 AND student_id=$3',[schoolId,priya.id,second.id])).rows.length)await ops.create(ctx,'guardians',{name:priya.name,studentId:second.id,userId:priya.id,relationship:'guardian',phone:'+910000000101',canView:true,canPickup:false});
 for(let n=1;n<=2;n++){
  const name='Netaji Route '+n+' (Demo)';let route=(await db.admin.query("SELECT * FROM transport_routes WHERE school_id=$1 AND payload->>'name'=$2 AND deleted_at IS NULL",[schoolId,name])).rows[0];if(!route)route=await ops.create(ctx,'routes',{name,stops:n===1?'Green Park Stop\nCommunity Library\nNetaji Public School':'Lake View Stop\nCommunity Centre\nNetaji Public School',feePaise:'0'});
  let vehicle=(await db.admin.query("SELECT * FROM vehicles WHERE school_id=$1 AND payload->>'registration'=$2 AND deleted_at IS NULL",[schoolId,'DEMO-BUS-0'+n])).rows[0];if(!vehicle){vehicle=await db.tenant(schoolId,principal.id,tx=>ops.insert(tx,ctx,'vehicles',{name:'School Bus '+n,registration:'DEMO-BUS-0'+n,routeId:route.id,driverName:driver.name,licenceExpiry:'2099-12-31',insuranceExpiry:'2099-12-31',fitnessExpiry:'2099-12-31'},{ownerId:driver.id}));}
  const assigned=n===1?[students[0],students[1]]:[students[2],second];for(const child of assigned)if(child)await transport.assign(ctx,{studentId:child.id,vehicleId:vehicle.id,stopName:n===1?'Green Park Stop':'Lake View Stop'});
 }
 await db.tenant(schoolId,principal.id,tx=>ops.audit(tx,ctx,'demo.transportReady','schools',schoolId,{fictional:true,buses:2,secondChild:second?.id}));
}
