/** Stable quetzal display even on browsers that fall back from es-GT. */
const whole=new Intl.NumberFormat('es-GT',{minimumFractionDigits:0,maximumFractionDigits:0});
const cents=new Intl.NumberFormat('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
let hidden=false;
/** "Ocultar montos": while active every formatted amount is masked (the app re-renders when it changes). */
export function setAmountsHidden(value:boolean){hidden=value}
export function amountsHidden(){return hidden}
export const MASKED_AMOUNT='Q\u00a0•••••';
/** Whole amounts show no decimals; any amount with cents always shows two (Q 6,539.50, never Q 6,539.5). */
export function formatMoney(value:number){
 if(hidden)return MASKED_AMOUNT;
 const abs=Math.abs(Math.round((Number.isFinite(value)?value:0)*100))/100;
 return (value<0&&abs>0?'−':'')+'Q '+(Number.isInteger(abs)?whole:cents).format(abs);
}
/** Masks amounts inside server-written text (alerts, notifications) while "Ocultar montos" is active. */
export function maskAmountsIn(text:string){return hidden?text.replace(/(US\$|Q)\s?[\d.,]*\d/g,(_,unit:string)=>unit+'\u00a0•••••'):text}
/** Rounded amount for chart axes and dense labels. */
export function formatMoneyRounded(value:number){return formatMoney(Math.round(Number.isFinite(value)?value:0))}
