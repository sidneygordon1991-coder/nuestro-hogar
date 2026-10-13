import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

let media:EventTarget&{matches:boolean;addEventListener:EventTarget['addEventListener']};
let attrs:Record<string,string>,stored:Map<string,string>;
beforeEach(()=>{
 vi.resetModules();attrs={};stored=new Map();media=Object.assign(new EventTarget(),{matches:true});
 vi.stubGlobal('document',{documentElement:{dataset:{}},querySelector:()=>({setAttribute:(name:string,value:string)=>{attrs[name]=value}})});
 vi.stubGlobal('localStorage',{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)});
 vi.stubGlobal('window',Object.assign(new EventTarget(),{matchMedia:()=>media}));
});
afterEach(()=>vi.unstubAllGlobals());
const dataset=()=>document.documentElement.dataset;

describe('appearance switch lifecycle',()=>{
 it('follows system changes on the login screen and saves explicit switch choices',async()=>{
  const {initializeTheme,toggleTheme}=await import('../AppMenu');
  initializeTheme();expect(dataset().theme).toBe('light');expect(dataset().themePreference).toBe('system');
  media.matches=false;media.dispatchEvent(new Event('change'));expect(dataset().theme).toBe('dark');
  toggleTheme();expect(dataset().theme).toBe('light');expect(stored.get('nh-theme')).toBe('light');
  media.dispatchEvent(new Event('change'));expect(dataset().theme).toBe('light');
  expect(attrs.content).toBe('#f3f7fb');
  toggleTheme();expect(dataset().theme).toBe('dark');expect(attrs.content).toBe('#0d141c');
 });
 it('synchronizes another tab and treats invalid saved values as automatic',async()=>{
  stored.set('nh-theme','obsolete');
  const {initializeTheme,readThemePreference}=await import('../AppMenu');
  expect(readThemePreference()).toBe('system');initializeTheme();
  stored.set('nh-theme','dark');
  const storage=Object.assign(new Event('storage'),{key:'nh-theme'});window.dispatchEvent(storage);
  expect(dataset().theme).toBe('dark');
  stored.delete('nh-theme');window.dispatchEvent(storage);expect(dataset().theme).toBe('light');
 });
 it('initializes system listeners once and broadcasts each change to both controls',async()=>{
  const {initializeTheme,toggleTheme}=await import('../AppMenu');
  const change=vi.fn();window.addEventListener('nh:theme-change',change);
  initializeTheme();initializeTheme();media.matches=false;media.dispatchEvent(new Event('change'));
  expect(change).toHaveBeenCalledTimes(1);toggleTheme();expect(change).toHaveBeenCalledTimes(2);
 });
});
