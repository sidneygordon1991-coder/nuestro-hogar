export type DailyAgendaItem={id:string;kind:'event'|'task'|'payment'|'birthday'|'meal'|'maintenance';title:string;date:string;time:string|null;subtitle:string;tab:string;assignedTo?:string|null};
export function selectDailyAgenda(items:DailyAgendaItem[],today:string,end:string,scope:'today'|'week',person:string,day=''){
 return items.filter(x=>x.date<=end&&(x.date<today||x.date===(scope==='today'?today:day)||scope==='week'&&!day)
  &&(!person||x.assignedTo===person||!x.assignedTo)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')||a.title.localeCompare(b.title,'es'));
}
