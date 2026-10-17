/** Stable quetzal display even on browsers that fall back from es-GT. */
const whole=new Intl.NumberFormat('es-GT',{minimumFractionDigits:0,maximumFractionDigits:0});
const cents=new Intl.NumberFormat('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
/** Whole amounts show no decimals; any amount with cents always shows two (Q 6,539.50, never Q 6,539.5). */
export function formatMoney(value:number){
 const abs=Math.abs(Math.round((Number.isFinite(value)?value:0)*100))/100;
 return (value<0&&abs>0?'−':'')+'Q '+(Number.isInteger(abs)?whole:cents).format(abs);
}
/** Rounded amount for chart axes and dense labels. */
export function formatMoneyRounded(value:number){return formatMoney(Math.round(Number.isFinite(value)?value:0))}
