import {describe,expect,it} from 'vitest';
import {creditCardStatus,dueAfter,lastStatementDate,nextDue} from './creditCards';
const card={id:'card',name:'Visa',account_type:'credit',account_class:'liability',opening_balance:0,statement_day:5,payment_due_day:25,minimum_payment:150,credit_limit:10000};
describe('credit card payments',()=>{
 it('finds the statement cut and the due date after it, clamping to month ends',()=>{
  expect(lastStatementDate(5,'2026-10-16')).toBe('2026-10-05');expect(lastStatementDate(20,'2026-10-16')).toBe('2026-09-20');
  expect(lastStatementDate(31,'2026-02-15')).toBe('2026-01-31');expect(dueAfter('2026-10-05',25)).toBe('2026-10-25');
  expect(dueAfter('2026-10-28',10)).toBe('2026-11-10');expect(nextDue(31,'2026-02-10')).toBe('2026-02-28');expect(nextDue(5,'2026-12-20')).toBe('2027-01-05');
 });
 it('asks for the statement balance minus payments since the cut, never the purchases after it',()=>{
  const movements=[{account_id:'card',type:'expense',amount:3000,transaction_date:'2026-09-20'},{account_id:'card',type:'expense',amount:800,transaction_date:'2026-10-10'}];
  const transfers=[{from_account_id:'bank',to_account_id:'card',amount:1000,transfer_date:'2026-10-12'}];
  const [s]=creditCardStatus([card],movements,transfers,'2026-10-16');
  expect(s.statementBalance).toBe(3000);expect(s.paidSinceStatement).toBe(1000);expect(s.toAvoidInterest).toBe(2000);
  expect(s.balance).toBe(2800);expect(s.dueDate).toBe('2026-10-25');expect(s.daysToDue).toBe(9);expect(s.state).toBe('due');
  expect(s.minimum).toBe(150);expect(s.available).toBe(7200);expect(s.utilization).toBe(28);
  expect(creditCardStatus([card],movements,transfers,'2026-10-23')[0].state).toBe('soon');
  expect(creditCardStatus([card],movements,[{...transfers[0],amount:3000}],'2026-10-16')[0].state).toBe('clear');
 });
 it('uses the whole balance when no statement day is configured and skips other accounts',()=>{
  const plain={...card,statement_day:null,payment_due_day:20};
  const [s]=creditCardStatus([plain,{id:'bank',name:'Banco',account_type:'checking',account_class:'asset',opening_balance:100}],[{account_id:'card',type:'expense',amount:500,transaction_date:'2026-10-01'}],[],'2026-10-16');
  expect(s.toAvoidInterest).toBe(500);expect(s.dueDate).toBe('2026-10-20');expect(s.statementDate).toBeNull();
 });
});
