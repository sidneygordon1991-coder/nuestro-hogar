/** Stable quetzal display even on browsers that fall back from es-GT. */
const amount=new Intl.NumberFormat('es-GT',{minimumFractionDigits:0,maximumFractionDigits:2});
export function formatMoney(value:number){return (value<0?'−':'')+'Q\u00a0'+amount.format(Math.abs(value));}
