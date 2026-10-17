import {describe,expect,it} from 'vitest';
import {autoMap,buildPreview,chunk,columnNames,dateRange,descriptionSimilarity,detectDelimiter,detectHeaderRow,emptyMapping,headerField,mappingProblem,markDuplicates,parseAmount,parseCsv,parseDate,readStatement} from './csvImport';

describe('CSV parsing',()=>{
 it('reads comma files with quoted fields, escaped quotes, embedded delimiters and line breaks',()=>{
  const rows=parseCsv('Fecha,Descripción,Monto\r\n01/10/2026,"Super ""La Torre"", zona 10","Q1,234.50"\r\n02/10/2026,"Pago\nluz",-250\r\n');
  expect(rows).toEqual([['Fecha','Descripción','Monto'],['01/10/2026','Super "La Torre", zona 10','Q1,234.50'],['02/10/2026','Pago\nluz','-250']]);
 });
 it('strips the BOM, trims unquoted cells and drops blank rows',()=>{
  expect(parseCsv('﻿a; b ;c\n\n ; ;\n1;2;3',';')).toEqual([['a','b','c'],['1','2','3']]);
 });
 it('keeps a final row without a trailing line break and empty cells in the middle',()=>{
  expect(parseCsv('a,,c\n1,2,')).toEqual([['a','','c'],['1','2','']]);
 });
 it('detects semicolon files even when amounts use decimal commas',()=>{
  const text='Fecha;Concepto;Débito;Crédito\n01/10/2026;Super;1.234,50;\n02/10/2026;Salario;;8.500,00\n03/10/2026;Luz;250,10;';
  expect(detectDelimiter(text)).toBe(';');
  expect(parseCsv(text)[1]).toEqual(['01/10/2026','Super','1.234,50','']);
 });
 it('detects commas and tabs, ignoring delimiters inside quotes',()=>{
  expect(detectDelimiter('date,description,amount\n2026-10-01,"a; b; c",5')).toBe(',');
  expect(detectDelimiter('fecha\tdetalle\tmonto\n01/10/2026\tx\t5')).toBe('\t');
  expect(detectDelimiter('﻿"Fecha";"Monto"\n"01/10/2026";"5,00"')).toBe(';');
 });
});

describe('header detection and column mapping',()=>{
 it('recognises Spanish and English headers, accents and plurals',()=>{
  expect(headerField('Fecha')).toBe('date');expect(headerField('Transaction Date')).toBe('date');expect(headerField('Fecha valor')).toBe('date');
  expect(headerField('Descripción')).toBe('description');expect(headerField('CONCEPTO')).toBe('description');expect(headerField('Detalle')).toBe('description');expect(headerField('Description')).toBe('description');
  expect(headerField('Débito')).toBe('debit');expect(headerField('Cargos')).toBe('debit');expect(headerField('Retiro')).toBe('debit');expect(headerField('Debit')).toBe('debit');
  expect(headerField('Crédito')).toBe('credit');expect(headerField('Abonos')).toBe('credit');expect(headerField('Depósito')).toBe('credit');expect(headerField('Credit')).toBe('credit');
  expect(headerField('Monto')).toBe('amount');expect(headerField('Valor')).toBe('amount');expect(headerField('Importe (Q)')).toBe('amount');expect(headerField('Amount')).toBe('amount');
 });
 it('prefers debit/credit over a generic amount word and ignores running balances',()=>{
  expect(headerField('Monto débito')).toBe('debit');expect(headerField('Monto crédito')).toBe('credit');
  expect(headerField('Descripción del cargo')).toBe('description');
  expect(headerField('Saldo')).toBeNull();expect(headerField('Saldo disponible')).toBeNull();expect(headerField('Balance')).toBeNull();
  expect(headerField('No. documento')).toBeNull();expect(headerField('')).toBeNull();
 });
 it('finds the header row below bank preamble lines',()=>{
  const rows=parseCsv('Banco Ejemplo\nCuenta 123-456\nPeríodo,01/10/2026 al 31/10/2026\nFecha,Referencia,Descripción,Débitos,Créditos,Saldo\n01/10/2026,1,Super,100.00,,900.00');
  const header=detectHeaderRow(rows);
  expect(header).toBe(3);
  expect(autoMap(rows[header])).toEqual({date:0,description:2,debit:3,credit:4,amount:null});
 });
 it('returns -1 without a header and names columns by position',()=>{
  const rows=parseCsv('01/10/2026,Super,-100\n02/10/2026,Pago,50');
  expect(detectHeaderRow(rows)).toBe(-1);
  expect(columnNames(rows,-1)).toEqual(['Columna 1','Columna 2','Columna 3']);
  expect(columnNames(parseCsv('Fecha,,Monto\n1,2,3,4'),0)).toEqual(['Fecha','Columna 2','Monto','Columna 4']);
 });
 it('maps only the first column for each field',()=>{
  expect(autoMap(['Fecha','Fecha valor','Concepto','Monto','Importe'])).toEqual({date:0,description:2,debit:null,credit:null,amount:3});
 });
 it('explains an incomplete or repeated mapping in Spanish',()=>{
  expect(mappingProblem(emptyMapping())).toMatch(/fecha/);
  expect(mappingProblem({...emptyMapping(),date:0})).toMatch(/descripción/);
  expect(mappingProblem({...emptyMapping(),date:0,description:1})).toMatch(/monto/);
  expect(mappingProblem({date:0,description:1,debit:2,credit:2,amount:null})).toMatch(/solo puede/);
  expect(mappingProblem({date:0,description:1,debit:null,credit:3,amount:null})).toBeNull();
 });
});

describe('dates',()=>{
 it('reads day-first, ISO and short-year formats',()=>{
  expect(parseDate('05/10/2026')).toBe('2026-10-05');
  expect(parseDate('5/1/26')).toBe('2026-01-05');
  expect(parseDate('31-12-99')).toBe('1999-12-31');
  expect(parseDate('2026-10-05')).toBe('2026-10-05');
  expect(parseDate('2026/1/5')).toBe('2026-01-05');
  expect(parseDate('05.10.2026')).toBe('2026-10-05');
  expect(parseDate(' 05/10/2026 14:35 ')).toBe('2026-10-05');
  expect(parseDate('2026-10-05T08:00:00')).toBe('2026-10-05');
  expect(parseDate('05-oct-2026')).toBe('2026-10-05');
  expect(parseDate('5 Ago 26')).toBe('2026-08-05');
 });
 it('rejects impossible or unreadable dates',()=>{
  for(const bad of ['','31/02/2026','29/02/2025','00/10/2026','10/13/2026','2026-13-01','hoy','1/10','Saldo final','12345'])expect(parseDate(bad),bad).toBeNull();
  expect(parseDate('29/02/2028')).toBe('2028-02-29');
 });
});

describe('amounts',()=>{
 it('reads quetzal, European and accounting formats',()=>{
  expect(parseAmount('Q1,234.50')).toBe(1234.5);
  expect(parseAmount('Q 1,234.50')).toBe(1234.5);
  expect(parseAmount('Q.1,234.50')).toBe(1234.5);
  expect(parseAmount('1.234,50')).toBe(1234.5);
  expect(parseAmount('1.234.567,89')).toBe(1234567.89);
  expect(parseAmount('1,234,567.89')).toBe(1234567.89);
  expect(parseAmount('(250.00)')).toBe(-250);
  expect(parseAmount('(Q 250.00)')).toBe(-250);
  expect(parseAmount('-250')).toBe(-250);
  expect(parseAmount('-Q250.10')).toBe(-250.1);
  expect(parseAmount('Q-250.10')).toBe(-250.1);
  expect(parseAmount('250.00-')).toBe(-250);
  expect(parseAmount('+75')).toBe(75);
  expect(parseAmount('250,5')).toBe(250.5);
  expect(parseAmount('1234,56')).toBe(1234.56);
  expect(parseAmount('1,234')).toBe(1234);
  expect(parseAmount('1.234')).toBe(1234);
  expect(parseAmount('0.125')).toBe(0.13);
  expect(parseAmount('.50')).toBe(.5);
  expect(parseAmount('US$ 12')).toBe(12);
  expect(parseAmount('1 234,50 GTQ')).toBe(1234.5);
  expect(parseAmount('0')).toBe(0);
  expect(parseAmount('-0.00')).toBe(0);
 });
 it('returns null for empty or unreadable values',()=>{
  for(const bad of ['','  ','-','abc','12a','1,23,4','1.2.3','12,34.5,6','Q','1,234.567,89'])expect(parseAmount(bad),bad).toBeNull();
 });
});

describe('preview',()=>{
 it('uses debit and credit columns and reports skipped rows with reasons',()=>{
  const {rows,headerIndex,mapping}=readStatement('Fecha;Descripción;Débito;Crédito;Saldo\n01/10/2026;Super;1.234,50;;5.000,00\n02/10/2026;Salario;;8.500,00;13.500,00\n32/10/2026;Malo;10;;\n03/10/2026;;10;;\n04/10/2026;Sin monto;;;\n05/10/2026;Doble;5;6;\n06/10/2026;Raro;abc;;\n;Saldo final;;;13.500,00');
  const preview=buildPreview(rows,headerIndex,mapping);
  expect(preview.filter(r=>r.valid)).toEqual([
   {line:2,date:'2026-10-01',description:'Super',amount:1234.5,type:'expense',valid:true,reason:null},
   {line:3,date:'2026-10-02',description:'Salario',amount:8500,type:'income',valid:true,reason:null}
  ]);
  expect(preview.filter(r=>!r.valid).map(r=>[r.line,r.reason])).toEqual([
   [4,'Fecha no válida: 32/10/2026'],[5,'Sin descripción'],[6,'Sin monto o monto en cero'],[7,'Tiene débito y crédito a la vez'],[8,'Monto no válido: abc'],[9,'Sin fecha']
  ]);
 });
 it('uses the sign or parentheses of a single amount column, optionally inverted',()=>{
  const rows=parseCsv('date,description,amount\n2026-10-01,Coffee,(45.00)\n2026-10-02,Refund,45.00\n2026-10-03,Fee,-3');
  const mapping=autoMap(rows[0]);
  expect(buildPreview(rows,0,mapping).map(r=>[r.type,r.amount])).toEqual([['expense',45],['income',45],['expense',3]]);
  expect(buildPreview(rows,0,mapping,{positiveIsExpense:true}).map(r=>r.type)).toEqual(['income','expense','income']);
 });
 it('treats negative values in a debit column as the same expense and falls back to the amount column',()=>{
  const rows=[['Fecha','Detalle','Cargo','Abono','Monto'],['01/10/2026','A','-50','',''],['02/10/2026','B','','','-20']];
  expect(buildPreview(rows,0,autoMap(rows[0])).map(r=>[r.type,r.amount])).toEqual([['expense',50],['expense',20]]);
 });
 it('works without a header row and limits descriptions to 250 characters',()=>{
  const long='x'.repeat(300);
  const rows=parseCsv(`01/10/2026,"${long}  ",-10\n02/10/2026,Pago   de   luz,-5`);
  const preview=buildPreview(rows,-1,{date:0,description:1,debit:null,credit:null,amount:2});
  expect(preview[0]).toMatchObject({line:1,valid:true});expect(preview[0].description).toHaveLength(250);
  expect(preview[1]).toMatchObject({line:2,description:'Pago de luz'});
 });
 it('rejects amounts above the database limit',()=>{
  const rows=[['Fecha','Concepto','Monto'],['01/10/2026','Error','99999999999']];
  expect(buildPreview(rows,0,autoMap(rows[0]))[0]).toMatchObject({valid:false,reason:'Monto fuera de rango'});
 });
});

describe('duplicates',()=>{
 it('scores description similarity ignoring case, accents and punctuation',()=>{
  expect(descriptionSimilarity('SUPERMERCADO LA TORRE','Supermercado la Torre')).toBe(1);
  expect(descriptionSimilarity('Pago Energía','PAGO ENERGIA.')).toBe(1);
  expect(descriptionSimilarity('POS 1234 LA TORRE Z10','La Torre')).toBe(.9);
  expect(descriptionSimilarity('Compra Walmart Majadas','Walmart Majadas')).toBeGreaterThanOrEqual(.5);
  expect(descriptionSimilarity('Farmacia Galeno','Gasolinera Puma')).toBe(0);
  expect(descriptionSimilarity('','Algo')).toBe(0);
 });
 it('flags same date, same amount and similar description only',()=>{
  const rows=buildPreview([['Fecha','Concepto','Monto'],['01/10/2026','SUPER LA TORRE','-125.50'],['01/10/2026','Farmacia','-125.50'],['02/10/2026','Super la Torre','-125.50'],['01/10/2026','Super La Torre','-125.00'],['xx','Super','-1']],0,{date:0,description:1,debit:null,credit:null,amount:2});
  const existing=[{transaction_date:'2026-10-01',amount:'125.50',description:'Super La Torre',type:'expense'},{transaction_date:'2026-10-03',amount:125.5,description:null}];
  const checked=markDuplicates(rows,existing);
  expect(checked.map(r=>r.duplicate)).toEqual([true,false,false,false,false]);
  expect(checked[0].duplicateOf).toBe('Super La Torre');
  expect(markDuplicates(rows,[])).toEqual(rows.map(r=>({...r,duplicate:false,duplicateOf:null})));
 });
 it('computes the date range of valid rows to query existing movements',()=>{
  const rows=buildPreview([['Fecha','Concepto','Monto'],['15/10/2026','b','1'],['02/10/2026','a','1'],['bad','c','1']],0,{date:0,description:1,debit:null,credit:null,amount:2});
  expect(dateRange(rows)).toEqual({from:'2026-10-02',to:'2026-10-15'});
  expect(dateRange([])).toBeNull();
 });
});

describe('chunks',()=>{
 it('splits into blocks of at most the given size',()=>{
  const items=Array.from({length:250},(_,i)=>i);
  expect(chunk(items,100).map(c=>c.length)).toEqual([100,100,50]);
  expect(chunk(items,100).flat()).toEqual(items);
  expect(chunk([],100)).toEqual([]);
  expect(()=>chunk(items,0)).toThrow();
 });
});
