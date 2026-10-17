/**
 * Bank statement CSV import: parsing, column mapping, Guatemalan date/amount formats and duplicate detection.
 * Pure functions only; the dialog in ImportStatement.tsx does the reading and saving.
 */

export type Delimiter=','|';'|'\t';
export type ColumnField='date'|'description'|'debit'|'credit'|'amount';
export type ColumnMapping=Record<ColumnField,number|null>;
export type MovementType='income'|'expense';
export type PreviewRow={
 /** 1-based line of the row in the file (as a spreadsheet would number it). */
 line:number;
 date:string|null;description:string;amount:number;type:MovementType|null;
 valid:boolean;reason:string|null;
};
export type ExistingMovement={transaction_date:string;amount:number|string;description:string|null;type?:string|null};
export type CheckedRow=PreviewRow&{duplicate:boolean;duplicateOf:string|null};
export type PreviewOptions={positiveIsExpense?:boolean};

export const MAX_AMOUNT=9999999999.99;
export const MAX_DESCRIPTION=250;
export const FIELD_LABELS:Record<ColumnField,string>={date:'Fecha',description:'Descripción',debit:'Débito (gasto)',credit:'Crédito (ingreso)',amount:'Monto con signo'};

/** Lowercase, without accents or punctuation, single spaces. */
export function normalizeText(value:string){
 return value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

export function stripBom(text:string){return text.charCodeAt(0)===0xfeff?text.slice(1):text}

/** Counts each candidate delimiter outside quotes, per line. */
function delimiterCounts(line:string){
 const counts={',':0,';':0,'\t':0} as Record<Delimiter,number>;let quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){if(quoted&&line[i+1]==='"'){i++;continue}quoted=!quoted}
  else if(!quoted&&(ch===','||ch===';'||ch==='\t'))counts[ch as Delimiter]++;
 }
 return counts;
}

/**
 * The delimiter that splits most of the first lines into the same number of columns.
 * "1.234,50" amounts in a semicolon file do not fool it: their commas are not consistent per line.
 */
export function detectDelimiter(text:string):Delimiter{
 const lines=stripBom(text).split(/\r\n|\n|\r/).filter(l=>l.trim()).slice(0,15);
 let best:Delimiter=',',bestScore=-1,bestWidth=0;
 for(const d of [',',';','\t'] as Delimiter[]){
  const counts=lines.map(l=>delimiterCounts(l)[d]).filter(n=>n>0);
  if(!counts.length)continue;
  const freq=new Map<number,number>();for(const n of counts)freq.set(n,(freq.get(n)||0)+1);
  const [width,score]=[...freq].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0];
  if(score>bestScore||(score===bestScore&&width>bestWidth)){best=d;bestScore=score;bestWidth=width}
 }
 return best;
}

/** RFC 4180 style: quoted fields, "" escapes, delimiters and line breaks inside quotes, CRLF, BOM. Blank rows are dropped. */
export function parseCsv(input:string,delimiter:Delimiter=detectDelimiter(input)):string[][]{
 const text=stripBom(input),rows:string[][]=[];
 let row:string[]=[],cell='',quoted=false,wasQuoted=false;
 const endCell=()=>{row.push(wasQuoted?cell:cell.trim());cell='';wasQuoted=false};
 const endRow=()=>{endCell();if(row.some(c=>c.trim()!==''))rows.push(row);row=[]};
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else quoted=false}
   else cell+=ch;
  }else if(ch==='"'&&cell.trim()===''){quoted=true;wasQuoted=true;cell=''}
  else if(ch===delimiter)endCell();
  else if(ch==='\r'){if(text[i+1]==='\n')i++;endRow()}
  else if(ch==='\n')endRow();
  else cell+=ch;
 }
 if(cell!==''||row.length)endRow();
 return rows;
}

const SYNONYMS:Record<ColumnField,string[]>={
 date:['fecha','date','fec','dia'],
 description:['descripcion','concepto','detalle','description','details','detail','memo','glosa','narrativa','narrative'],
 debit:['debito','debitos','debe','cargo','cargos','retiro','retiros','debit','debits','withdrawal','withdrawals','egreso','egresos'],
 credit:['credito','creditos','haber','abono','abonos','deposito','depositos','credit','credits','deposit','deposits','ingreso','ingresos'],
 amount:['monto','valor','importe','amount','cantidad']
};
const IGNORED=['saldo','balance','disponible'];

/** Which field a header names, or null. Debit/credit win over a generic amount ("Monto débito"). */
export function headerField(header:string):ColumnField|null{
 const tokens=normalizeText(header).split(' ').filter(Boolean);
 if(!tokens.length||tokens.some(t=>IGNORED.includes(t)))return null;
 const position=(field:ColumnField)=>{const i=tokens.findIndex(t=>SYNONYMS[field].includes(t));return i<0?Infinity:i};
 const found=(['date','description','debit','credit','amount'] as ColumnField[]).map(field=>({field,at:position(field)})).filter(x=>x.at!==Infinity);
 if(!found.length)return null;
 const specific=found.filter(x=>x.field!=='amount');
 if(specific.some(x=>x.field==='debit'||x.field==='credit')&&found.some(x=>x.field==='amount'))return specific.filter(x=>x.field==='debit'||x.field==='credit').sort((a,b)=>a.at-b.at)[0].field;
 return (specific.length?specific:found).sort((a,b)=>a.at-b.at)[0].field;
}

/** Index of the header row among the first rows (at least two recognised columns, one of them a date or amount), or -1. */
export function detectHeaderRow(rows:string[][],maxScan=15):number{
 for(let i=0;i<Math.min(rows.length,maxScan);i++){
  const fields=rows[i].map(headerField).filter(Boolean) as ColumnField[];
  if(new Set(fields).size>=2&&fields.some(f=>f!=='description')&&!rows[i].some(c=>parseDate(c)))return i;
 }
 return -1;
}

export function emptyMapping():ColumnMapping{return {date:null,description:null,debit:null,credit:null,amount:null}}

/** First column for each field, by header name. */
export function autoMap(headers:string[]):ColumnMapping{
 const mapping=emptyMapping();
 headers.forEach((header,index)=>{const field=headerField(header);if(field&&mapping[field]===null)mapping[field]=index});
 return mapping;
}

/** Labels for the mapping selects: the header text, or "Columna N" when the file has no header. */
export function columnNames(rows:string[][],headerIndex:number){
 const width=Math.max(0,...rows.map(r=>r.length));
 return Array.from({length:width},(_,i)=>{const h=headerIndex>=0?(rows[headerIndex][i]||'').trim():'';return h?h:'Columna '+(i+1)});
}

/** Spanish message for an unusable mapping, or null. */
export function mappingProblem(mapping:ColumnMapping):string|null{
 if(mapping.date===null)return 'Elige la columna de la fecha.';
 if(mapping.description===null)return 'Elige la columna de la descripción.';
 if(mapping.debit===null&&mapping.credit===null&&mapping.amount===null)return 'Elige la columna del monto, o las de débito y crédito.';
 const used=Object.values(mapping).filter(v=>v!==null);
 if(new Set(used).size!==used.length)return 'Cada columna solo puede usarse para un dato.';
 return null;
}

const MONTHS:Record<string,number>={ene:1,jan:1,feb:2,mar:3,abr:4,apr:4,may:5,jun:6,jul:7,ago:8,aug:8,sep:9,set:9,oct:10,nov:11,dic:12,dec:12};
const isoOf=(y:number,m:number,d:number)=>{
 if(y<1900||y>2100||m<1||m>12||d<1||d>new Date(y,m,0).getDate())return null;
 return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
};
const fullYear=(y:string)=>y.length===2?(Number(y)<=69?2000:1900)+Number(y):Number(y);

/** dd/mm/yyyy, d/m/yy, yyyy-mm-dd (also with - or .), "05-oct-2026"; a trailing time is ignored. Returns YYYY-MM-DD or null. */
export function parseDate(value:string):string|null{
 const text=value.trim().split(/[T\s]+(?=\d{1,2}:)/)[0].trim();
 let m=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
 if(m)return isoOf(Number(m[1]),Number(m[2]),Number(m[3]));
 m=text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
 if(m)return isoOf(fullYear(m[3]),Number(m[2]),Number(m[1]));
 m=normalizeText(text).match(/^(\d{1,2}) ([a-z]{3})[a-z]* (\d{2}|\d{4})$/);
 if(m&&MONTHS[m[2]])return isoOf(fullYear(m[3]),MONTHS[m[2]],Number(m[1]));
 return null;
}

/**
 * Signed amount from bank formats: "Q1,234.50", "1.234,50", "(250.00)", "-250", "250.00-", "US$ 12".
 * A single separator followed by exactly three digits is a thousands separator ("1,234" → 1234).
 * Returns null for an empty or unreadable value.
 */
export function parseAmount(value:string):number|null{
 let s=value.replace(/[\s\u00a0]/g,'');
 if(!s)return null;
 let negative=false;
 // Peel parentheses, signs and currency marks in any order: "-Q250", "Q-250", "(Q 250.00)", "250.00-".
 for(let guard=0;guard<5;guard++){
  const before=s;
  if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1)}
  if(/^[-\u2212]/.test(s)){negative=true;s=s.slice(1)}else if(s.startsWith('+'))s=s.slice(1);
  if(/[-\u2212]$/.test(s)){negative=true;s=s.slice(0,-1)}
  s=s.replace(/^(GTQ|USD|US\$|Q\.?|\$)/i,'').replace(/(GTQ|USD|Q)$/i,'');
  if(s===before)break;
 }
 if(!/^[\d.,]+$/.test(s)||!/\d/.test(s))return null;
 const dot=s.lastIndexOf('.'),comma=s.lastIndexOf(',');
 let normalized:string;
 if(dot>=0&&comma>=0){
  const decimal=dot>comma?'.':',',thousands=decimal==='.'?',':'.';
  const at=s.lastIndexOf(decimal),whole=s.slice(0,at),fraction=s.slice(at+1);
  if(!/^\d*$/.test(fraction)||whole.includes(decimal))return null;
  if(!new RegExp('^\\d{1,3}(\\'+thousands+'\\d{3})*$').test(whole))return null;
  normalized=whole.split(thousands).join('')+'.'+(fraction||'0');
 }else if(dot>=0||comma>=0){
  const parts=s.split(dot>=0?'.':',');
  const grouped=parts.length>2||(parts[1].length===3&&/^[1-9]\d{0,2}$/.test(parts[0]));
  if(grouped){
   if(!/^\d{1,3}$/.test(parts[0])||parts.slice(1).some(p=>!/^\d{3}$/.test(p)))return null;
   normalized=parts.join('');
  }else normalized=(parts[0]||'0')+'.'+(parts[1]||'0');
 }else normalized=s;
 const amount=Math.round(Number(normalized)*100)/100;
 if(!Number.isFinite(amount))return null;
 return negative&&amount!==0?-amount:amount;
}

const cell=(row:string[],index:number|null)=>index===null?'':(row[index]??'').trim();

/** One preview row per non-blank data row after the header, valid or with the reason it is skipped. */
export function buildPreview(rows:string[][],headerIndex:number,mapping:ColumnMapping,options:PreviewOptions={}):PreviewRow[]{
 const result:PreviewRow[]=[];
 for(let i=headerIndex+1;i<rows.length;i++){
  const row=rows[i];if(!row.some(c=>c.trim()))continue;
  const rawDate=cell(row,mapping.date),date=parseDate(rawDate);
  const description=cell(row,mapping.description).replace(/\s+/g,' ').slice(0,MAX_DESCRIPTION);
  const base={line:i+1,date,description,amount:0,type:null as MovementType|null};
  const invalid=(reason:string):PreviewRow=>({...base,valid:false,reason});
  if(!rawDate){result.push(invalid('Sin fecha'));continue}
  if(!date){result.push(invalid('Fecha no válida: '+rawDate));continue}
  if(!description){result.push(invalid('Sin descripción'));continue}
  let amount=0,type:MovementType|null=null,problem:string|null=null;
  const readable=(index:number|null)=>{const raw=cell(row,index);if(!raw||raw==='-')return 0;const n=parseAmount(raw);if(n===null){problem='Monto no válido: '+raw;return 0}return Math.abs(n)};
  if(mapping.debit!==null||mapping.credit!==null){
   const debit=readable(mapping.debit),credit=readable(mapping.credit);
   if(!problem){
    if(debit>0&&credit>0)problem='Tiene débito y crédito a la vez';
    else if(debit>0){amount=debit;type='expense'}
    else if(credit>0){amount=credit;type='income'}
   }
  }
  if(!problem&&!type&&mapping.amount!==null){
   const raw=cell(row,mapping.amount);
   if(raw&&raw!=='-'){
    const n=parseAmount(raw);
    if(n===null)problem='Monto no válido: '+raw;
    else if(n!==0){amount=Math.abs(n);type=(n<0)!==Boolean(options.positiveIsExpense)?'expense':'income'}
   }
  }
  if(problem){result.push(invalid(problem));continue}
  if(!type){result.push(invalid('Sin monto o monto en cero'));continue}
  if(amount>MAX_AMOUNT){result.push(invalid('Monto fuera de rango'));continue}
  result.push({...base,amount,type,valid:true,reason:null});
 }
 return result;
}

const STOP=new Set(['de','del','la','el','en','por','a','y','the','of','to','pago','compra','pos']);
const tokens=(value:string)=>new Set(normalizeText(value).split(' ').filter(t=>t.length>1&&!STOP.has(t)));

/** 0–1: 1 when equal after normalising, 0.9 when one contains the other, otherwise shared-word (Jaccard) overlap. */
export function descriptionSimilarity(a:string,b:string){
 const x=normalizeText(a),y=normalizeText(b);
 if(!x||!y)return 0;
 if(x===y)return 1;
 const compactX=x.replace(/ /g,''),compactY=y.replace(/ /g,'');
 if(compactX===compactY)return 1;
 const [short,long]=compactX.length<=compactY.length?[compactX,compactY]:[compactY,compactX];
 if(short.length>=4&&long.includes(short))return .9;
 const tx=tokens(a),ty=tokens(b);
 if(!tx.size||!ty.size)return 0;
 let shared=0;for(const t of tx)if(ty.has(t))shared++;
 return shared/(tx.size+ty.size-shared);
}
export const SIMILAR_DESCRIPTION=.5;

/** Flags valid rows that match an existing movement: same date, same amount (to the cent) and a similar description. */
export function markDuplicates(rows:PreviewRow[],existing:ExistingMovement[]):CheckedRow[]{
 const byKey=new Map<string,ExistingMovement[]>();
 for(const e of existing){
  const key=e.transaction_date+'|'+Math.round(Math.abs(Number(e.amount))*100);
  byKey.set(key,[...(byKey.get(key)||[]),e]);
 }
 return rows.map(row=>{
  if(!row.valid||!row.date)return {...row,duplicate:false,duplicateOf:null};
  const match=(byKey.get(row.date+'|'+Math.round(row.amount*100))||[]).find(e=>descriptionSimilarity(row.description,e.description||'')>=SIMILAR_DESCRIPTION);
  return {...row,duplicate:Boolean(match),duplicateOf:match?String(match.description||''):null};
 });
}

/** Date range (inclusive) covered by the valid rows, to query existing movements once. */
export function dateRange(rows:PreviewRow[]):{from:string;to:string}|null{
 const dates=rows.filter(r=>r.valid&&r.date).map(r=>r.date!).sort();
 return dates.length?{from:dates[0],to:dates[dates.length-1]}:null;
}

export function chunk<T>(items:T[],size:number):T[][]{
 if(size<1)throw new Error('El tamaño del bloque debe ser positivo.');
 const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;
}

/** Everything the dialog needs from a file's text: rows, delimiter, header row, column names and a first mapping. */
export function readStatement(text:string){
 const delimiter=detectDelimiter(text),rows=parseCsv(text,delimiter),headerIndex=detectHeaderRow(rows);
 const names=columnNames(rows,headerIndex);
 return {delimiter,rows,headerIndex,columns:names,mapping:headerIndex>=0?autoMap(rows[headerIndex]):emptyMapping()};
}
