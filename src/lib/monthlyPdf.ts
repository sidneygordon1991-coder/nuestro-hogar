import {jsPDF} from 'jspdf';
import regularUrl from './report-regular.ttf?url';
import boldUrl from './report-bold.ttf?url';
type ReportFonts={regular:string;bold:string};
let fontPromise:Promise<ReportFonts>|undefined;
async function loadFonts(){
 if(!fontPromise)fontPromise=Promise.all([regularUrl,boldUrl].map(async url=>{const response=await fetch(url);if(!response.ok)throw new Error('No se pudo cargar la tipografía del reporte.');const bytes=new Uint8Array(await response.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(data)})).then(([regular,bold])=>({regular,bold})).catch(error=>{fontPromise=undefined;throw error});
 return fontPromise;
}

export type MonthlyReport={month:string;period_end?:string;score:number;status_label:string;financial:{income:number;expense:number;saving:number;balance:number;budget:number;saving_rate:number};previous?:{income:number;expense:number;saving:number;balance:number};operations?:Record<string,number>;top_categories?:{name:string;amount:number;share:number}[];insights?:{title:string;body:string}[];suggested_focus?:string[]};
const clean=(value:unknown)=>String(value??'').normalize('NFC').replace(/[\u00a0\u202f]/g,' ').replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e\u00a0-\u00ff\n]/g,'');
const money=(n:number)=>clean(new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:2}).format(Number(n||0)));
export async function buildMonthlyPdf(householdName:string,snapshot:MonthlyReport,options:{reflection?:string|null;focus?:string[];closed?:boolean}={},fontData?:ReportFonts){
 const fonts=fontData||await loadFonts();
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true});doc.addFileToVFS('report-regular.ttf',fonts.regular);doc.addFont('report-regular.ttf','Report','normal');doc.addFileToVFS('report-bold.ttf',fonts.bold);doc.addFont('report-bold.ttf','Report','bold');const margin=17,width=176,bottom=276;let y=20;
 doc.setProperties({title:'Resumen mensual - '+clean(householdName),author:'Nuestro Hogar',subject:'Finanzas y organización familiar'});
 function header(first=false){doc.setFillColor(18,43,59);doc.rect(0,0,210,first?12:17,'F');doc.setFont('Report','bold');doc.setTextColor(first?24:255,first?72:255,first?94:255);doc.setFontSize(first?9:8);doc.text('NUESTRO HOGAR'+(first?'':' / RESUMEN MENSUAL'),margin,first?22:11);y=first?31:27}
 function room(height:number){if(y+height>bottom){doc.addPage();header()}}
 function text(value:unknown,size=10,bold=false,color:[number,number,number]=[38,59,74],maxWidth=width){doc.setFont('Report',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);const lines=doc.splitTextToSize(clean(value),maxWidth) as string[];for(const line of lines){room(size*.42+2);doc.setFont('Report',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(line,margin,y);y+=size*.42+1}return lines.length}
 function section(label:string){room(20);y+=6;doc.setDrawColor(211,225,233);doc.line(margin,y-6,193,y-6);text(label,12,true,[14,103,133]);y+=2}
 header(true);text(householdName||'Tu familia',23,true);const period=new Date(snapshot.month+'T12:00').toLocaleDateString('es-GT',{month:'long',year:'numeric'});text(period.charAt(0).toUpperCase()+period.slice(1),12,false,[83,109,128]);text(options.closed?'Cierre guardado':'Vista previa - datos al '+new Date((snapshot.period_end||snapshot.month)+'T12:00').toLocaleDateString('es-GT'),9,false,[83,109,128]);y+=7;
 const metrics=[['Ingresos',snapshot.financial.income],['Gastos',snapshot.financial.expense],['Ahorro',snapshot.financial.saving],['Balance',snapshot.financial.balance]] as const;room(50);
 metrics.forEach(([label,value],index)=>{const x=margin+(index%2)*90,top=y+Math.floor(index/2)*25;doc.setFillColor(239,246,250);doc.roundedRect(x,top,86,22,3,3,'F');doc.setTextColor(83,109,128);doc.setFontSize(9);doc.setFont('Report','normal');doc.text(label,x+5,top+7);doc.setTextColor(24,60,79);doc.setFontSize(15);doc.setFont('Report','bold');doc.text(money(value),x+5,top+16)});y+=53;
 text('Presupuesto: '+money(snapshot.financial.budget)+' | Tasa de ahorro: '+Number(snapshot.financial.saving_rate||0).toFixed(1)+'%',9);text('Salud del hogar: '+snapshot.score+'/100 - '+snapshot.status_label,10,true);text('El balance considera ingresos, gastos y ahorro registrado.',8,false,[83,109,128]);
 if(snapshot.previous){section('Comparación con el mes anterior');for(const [label,key] of [['Ingresos','income'],['Gastos','expense'],['Ahorro','saving'],['Balance','balance']] as const){const current=Number(snapshot.financial[key]||0),previous=Number(snapshot.previous[key]||0);text(`${label}: ${money(previous)} -> ${money(current)} (${current-previous>=0?'+':''}${money(current-previous)})`,9)}}
 if(snapshot.top_categories?.length){section('Distribución de gastos');for(const row of snapshot.top_categories){room(20);text(row.name,10,true);text(money(row.amount)+' - '+Number(row.share||0).toFixed(1)+'% del gasto',9,false,[83,109,128]);const share=Math.max(0,Math.min(100,Number(row.share)||0));doc.setFillColor(223,234,240);doc.roundedRect(margin,y,width,2,1,1,'F');if(share){doc.setFillColor(24,133,170);doc.roundedRect(margin,y,width*share/100,2,1,1,'F')}y+=8}}
 if(snapshot.operations){section('Organización del hogar');const labels:Record<string,string>={tasks_completed:'Tareas completadas',tasks_overdue:'Tareas vencidas',events:'Eventos',recurring_paid:'Pagos recurrentes atendidos',recurring_pending:'Pagos pendientes',documents_due:'Documentos con vencimiento',maintenance_count:'Servicios de mantenimiento',meals_prepared:'Comidas preparadas'};for(const [key,label] of Object.entries(labels))text(label+': '+Number(snapshot.operations[key]||0),9)}
 if(snapshot.insights?.length){section('Hallazgos del mes');for(const item of snapshot.insights){room(18);text(item.title,10,true);text(item.body,9);y+=3}}
 if(options.reflection){section('Reflexión de la familia');text(options.reflection,10)}
 const focus=options.focus||snapshot.suggested_focus||[];if(focus.length){section('Prioridades para el próximo mes');focus.forEach((item,index)=>text((index+1)+'. '+item,10))}
 for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setDrawColor(211,225,233);doc.line(margin,283,193,283);doc.setFont('Report','normal');doc.setFontSize(8);doc.setTextColor(83,109,128);doc.text('Nuestro Hogar - Documento privado de la familia',margin,289);doc.text(page+' / '+doc.getNumberOfPages(),193,289,{align:'right'})}
 return doc;
}
export async function downloadMonthlyPdf(name:string,snapshot:MonthlyReport,options:Parameters<typeof buildMonthlyPdf>[2]={}){const doc=await buildMonthlyPdf(name,snapshot,options);doc.save('nuestro-hogar-resumen-'+snapshot.month.slice(0,7)+'.pdf')}
