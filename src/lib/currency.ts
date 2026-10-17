import {amountsHidden,formatMoney} from './money';

/** Fallback rate when a household has not saved its own (quetzales per US dollar). */
export const DEFAULT_USD_RATE=7.75;
export type OriginalAmount={original_currency?:string|null;original_amount?:number|string|null;exchange_rate?:number|string|null};

export function usdRate(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>0&&n<1000?n:DEFAULT_USD_RATE}
/** Every movement is stored in quetzales; a dollar entry converts once, rounded to cents. */
export function usdToQuetzales(usd:number,rate:number){
 if(!Number.isFinite(usd)||!Number.isFinite(rate))return Number.NaN;
 const sign=usd<0?-1:1,amount=BigInt(Math.round(Math.abs(usd)*100)),units=BigInt(Math.round(rate*10000));
 return sign*Number((amount*units+5000n)/10000n)/100;
}
const usd=new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
export function formatUsd(value:number){if(amountsHidden())return 'US$\u00a0•••••';const abs=Math.abs(Math.round(value*100))/100;return (value<0&&abs>0?'−':'')+'US$ '+(Number.isInteger(abs)?usd.format(abs):abs.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}))}
/** "US$ 50 · Q 387.50" for dollar entries, "Q 387.50" otherwise. */
export function formatEntryAmount(amount:number,entry:OriginalAmount={}){
 return entry.original_currency==='USD'&&Number(entry.original_amount)>0?formatUsd(Number(entry.original_amount))+' · '+formatMoney(amount):formatMoney(amount);
}
