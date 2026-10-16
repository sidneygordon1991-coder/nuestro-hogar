import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** The module owns its buttons and state; only its heading renders in the shell. */
export const WorkspaceHeadingSlot=createContext<HTMLDivElement|null|undefined>(undefined);
export default function WorkspaceHeading({children,className=''}:{children:ReactNode;className?:string}){
 const slot=useContext(WorkspaceHeadingSlot);
 const heading=<div className={['workspace-heading',className].filter(Boolean).join(' ')}>{children}</div>;
 if(slot===undefined)return heading;
 return slot?createPortal(heading,slot):null;
}
