import {describe,expect,it} from 'vitest';
import {notificationUrl} from '../../supabase/functions/send-web-push/notificationUrl';
import {financeSection} from './financeNavigation';
describe('push links into the existing app router',()=>{
 for(const section of ['budget','transactions','accounts'])it('opens the '+section+' section of Finance',()=>{
  const url=new URL(notificationUrl('presupuesto:'+section),'https://example.invalid');
  expect(url.searchParams.get('tab')).toBe('presupuesto');expect(financeSection(url.searchParams.get('finance'))).toBe(section);
 });
 it('preserves ordinary tabs and defaults missing destinations to Home',()=>{expect(notificationUrl('calendario')).toBe('/nuestro-hogar/?tab=calendario');expect(notificationUrl(null)).toBe('/nuestro-hogar/?tab=inicio')});
 it('encodes destination content without adding query parameters or changing origin',()=>{const url=new URL(notificationUrl('presupuesto:budget&tab=master'),'https://example.invalid');expect(url.origin).toBe('https://example.invalid');expect(url.searchParams.getAll('tab')).toEqual(['presupuesto']);expect(url.searchParams.get('finance')).toBe('budget&tab=master')});
});
