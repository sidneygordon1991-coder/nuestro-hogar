import {describe,expect,it} from 'vitest';
import {defaultVisibility,historyStart,isValidAmount,normalizeDescription,recentRepeats,suggestCategory,visibilityHint,type QuickHistoryRow} from './quickEntry';

const categories=[
 {id:'food',name:'Alimentación'},{id:'out',name:'Comidas fuera'},{id:'transport',name:'Transporte'},
 {id:'services',name:'Casa y servicios'},{id:'health',name:'Salud'},{id:'school',name:'Educación'},{id:'salary',name:'Salario'}
];
const row=(description:string,category_id:string|null,amount=100,type='expense',transaction_date='2026-10-10'):QuickHistoryRow=>({description,type,category_id,amount,transaction_date});

describe('normalizeDescription',()=>{
 it('ignores accents, case, punctuation and extra spaces',()=>{
  expect(normalizeDescription('  Súper   LA Torre ')).toBe('super la torre');
  expect(normalizeDescription('Café, almuerzo!')).toBe('cafe almuerzo');
  expect(normalizeDescription(null)).toBe('');
 });
});

describe('recentRepeats',()=>{
 it('keeps the newest of each description + type + category, up to six',()=>{
  const rows=[row('Supermercado','food',450),row('supermercado ','food',300),row('Supermercado','out',80),row('Supermercado','food',50,'income'),row('Gasolina','transport',200),row('Luz','services',310),row('Internet','services',299),row('Farmacia','health',75),row('Colegio','school',900)];
  const chips=recentRepeats(rows);
  expect(chips).toHaveLength(6);
  expect(chips[0]).toEqual({key:'supermercado|expense|food',description:'Supermercado',type:'expense',category_id:'food',amount:450});
  expect(chips.map(c=>c.key)).toEqual(['supermercado|expense|food','supermercado|expense|out','supermercado|income|food','gasolina|expense|transport','luz|expense|services','internet|expense|services']);
 });
 it('skips rows outside the window, without description or with invalid amounts',()=>{
  const chips=recentRepeats([row('','food'),row('Viejo','food',10,'expense','2026-07-01'),row('Cero','food',0),row('Raro','food',10,'transfer'),row('Bueno','food','12.50' as any)],{since:'2026-08-18'});
  expect(chips).toEqual([{key:'bueno|expense|food',description:'Bueno',type:'expense',category_id:'food',amount:12.5}]);
  expect(recentRepeats([])).toEqual([]);
 });
 it('computes the 60-day window start in local time',()=>{expect(historyStart(new Date(2026,9,17))).toBe('2026-08-18')});
});

describe('suggestCategory',()=>{
 const history=[row('Super La Torre','out'),row('super la torre','food'),row('Súper la Torre','food'),row('Gasolinera Puma','transport'),row('Pago empresa','salary',5000,'income')];
 it('prefers the most used category for the same normalized description',()=>{
  expect(suggestCategory('SUPER  la torre',history,categories,'expense')).toBe('food');
 });
 it('falls back to a prefix match',()=>{
  expect(suggestCategory('Gasolinera',history,categories,'expense')).toBe('transport');
  expect(suggestCategory('super la',history,categories,'expense')).toBe('food');
 });
 it('uses the keyword map by category name when there is no history',()=>{
  expect(suggestCategory('Despensa semanal',[],categories)).toBe('food');
  expect(suggestCategory('Uber al trabajo',[],categories)).toBe('transport');
  expect(suggestCategory('Recibo de luz',[],categories)).toBe('services');
  expect(suggestCategory('Teléfono',[],categories)).toBe('services');
  expect(suggestCategory('Cena con amigos',[],categories)).toBe('out');
  expect(suggestCategory('Café',[],categories)).toBe('out');
  expect(suggestCategory('Farmacia',[],categories)).toBe('health');
  expect(suggestCategory('Clínica dental',[],categories)).toBe('health');
  expect(suggestCategory('Colegio de Sofía',[],categories)).toBe('school');
  expect(suggestCategory('Universidad',[],categories)).toBe('school');
 });
 it('prefers a supermarket category over a generic food one',()=>{
  expect(suggestCategory('super',[],[...categories,{id:'market',name:'Supermercado'}])).toBe('market');
 });
 it('returns null when nothing matches, the text is too short or the category no longer exists',()=>{
  expect(suggestCategory('Regalo',[],categories)).toBeNull();
  expect(suggestCategory('s',history,categories)).toBeNull();
  expect(suggestCategory('Gasolina',[],[{id:'x',name:'Otros'}])).toBeNull();
  expect(suggestCategory('Otra cosa',[row('Otra cosa','deleted')],categories)).toBeNull();
 });
 it('keeps history per movement type and skips keywords for income',()=>{
  expect(suggestCategory('Pago empresa',history,categories,'income')).toBe('salary');
  expect(suggestCategory('Pago empresa',history,categories,'expense')).toBeNull();
  expect(suggestCategory('Supermercado',[],categories,'income')).toBeNull();
 });
});

describe('amounts and audience',()=>{
 it('accepts positive amounts with cents only',()=>{
  expect(isValidAmount(387.5)).toBe(true);expect(isValidAmount(0.01)).toBe(true);
  expect(isValidAmount(0)).toBe(false);expect(isValidAmount(-5)).toBe(false);expect(isValidAmount(1.005)).toBe(false);expect(isValidAmount(NaN)).toBe(false);
 });
 it('shares by default only when the household has more than one member',()=>{
  expect(defaultVisibility(2)).toBe('shared');expect(defaultVisibility(1)).toBe('personal');expect(defaultVisibility(0)).toBe('personal');
  expect(visibilityHint('private')).toBe('Solo tú lo ves. No cuenta en las finanzas del hogar.');
 });
});
