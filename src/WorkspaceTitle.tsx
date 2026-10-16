import {CircleHelp} from 'lucide-react';
import ModuleIcon,{type ModuleIconName} from './ModuleIcon';
import {moduleGuides} from './lib/moduleGuides';
import {useContext} from 'react';
import {WorkspaceHeadingSlot} from './WorkspaceHeading';

/** Shared heading without a <header>/<nav> that would inherit shell positioning. */
export default function WorkspaceTitle({module,eyebrow,title,description}:{module:keyof typeof moduleGuides;eyebrow:string;title:string;description:string}){
 const guide=moduleGuides[module];
 const integrated=useContext(WorkspaceHeadingSlot)!==undefined;
 return <div className="workspace-title"><span className="workspace-title-icon" aria-hidden="true"><ModuleIcon name={module as ModuleIconName} size={27}/></span><div className="workspace-title-copy">{!integrated&&<p className="eyebrow">{eyebrow}</p>}<h2 className="page-title">{title}</h2>{!integrated&&<p className="muted">{description}</p>}<details className="workspace-help"><summary><CircleHelp size={14}/> Guía rápida</summary>{integrated&&<p className="workspace-description">{description}</p>}<ol>{guide.map(step=><li key={step}>{step}</li>)}</ol></details></div></div>;
}
