export type AdRole='parent'|'teacher'|'principal'|'hod'|'management'|'admin'|'accounts'|'student';
export const adSlots=['parent_home_feed','parent_calendar_card','parent_gallery_card','teacher_home_card','management_home_card','school_feed_native','teacher_classes_card']as const;
export const adRoutes=['home','calendar','gallery','feed','classes']as const;
export type AdRoute=typeof adRoutes[number];
export const adEvents=['impression','click','report','video_start','video_complete']as const;
export function slotAllowed(role:AdRole,route:string,slot:string,classroom=false){
 if(classroom||['student','accounts'].includes(role))return false;
 if(route==='feed'&&slot==='school_feed_native')return ['parent','teacher','principal','hod','management','admin'].includes(role);
 if(route==='classes'&&slot==='teacher_classes_card')return role==='teacher';
 const allowed:Record<string,Record<string,string[]>>={parent:{home:['parent_home_feed'],calendar:['parent_calendar_card'],gallery:['parent_gallery_card']},teacher:{home:['teacher_home_card']},principal:{home:['management_home_card']},hod:{home:['management_home_card']},management:{home:['management_home_card']},admin:{home:['management_home_card']}};
 return allowed[role]?.[route]?.includes(slot)??false;
}
