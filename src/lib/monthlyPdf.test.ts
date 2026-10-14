import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {buildMonthlyPdf,type MonthlyReport} from './monthlyPdf';
const report:MonthlyReport={month:'2026-10-01',period_end:'2026-10-13',score:84,status_label:'Buen avance',financial:{income:12000,expense:6000,saving:2000,balance:4000,budget:8000,saving_rate:16.7},previous:{income:10000,expense:6500,saving:1500,balance:2000},top_categories:[{name:'Alimentación',amount:1500,share:25}],insights:[{title:'Ahorro positivo',body:'El hogar mantiene un ahorro constante.'}]};
describe('monthly report PDF',()=>{
 it('creates a real PDF and paginates long reflections without losing the footer',async()=>{const pdf=await buildMonthlyPdf('Familia Gordon Colindres',report,{reflection:'Una reflexión mensual extensa para revisar con la familia. '.repeat(150),focus:['Conservar el ahorro','Revisar alimentación']},{regular:readFileSync(new URL('./report-regular.ttf',import.meta.url)).toString('base64'),bold:readFileSync(new URL('./report-bold.ttf',import.meta.url)).toString('base64')});expect(pdf.getNumberOfPages()).toBeGreaterThan(1);const bytes=pdf.output('arraybuffer');expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-')});
});
