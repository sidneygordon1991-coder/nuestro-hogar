/** Nuestro Hogar mark: a house outline holding a heart. Inherits the surrounding text color. */
export default function BrandMark({size=30,className=''}:{size?:number;className?:string}){
 return <svg className={['brand-mark-icon',className].filter(Boolean).join(' ')} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  <path d="M4 14.5 16 4l12 10.5"/>
  <path d="M7 12.2V27a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V12.2"/>
  <path className="brand-mark-heart" d="M16 23.6s-5-2.9-5-6.4a2.7 2.7 0 0 1 5-1.5 2.7 2.7 0 0 1 5 1.5c0 3.5-5 6.4-5 6.4z" fill="currentColor" stroke="none"/>
 </svg>;
}
