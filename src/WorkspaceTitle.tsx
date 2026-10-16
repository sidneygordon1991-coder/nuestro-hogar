import {CircleHelp} from 'lucide-react';
import ModuleIcon,{type ModuleIconName} from './ModuleIcon';
import {moduleGuides} from './lib/moduleGuides';

/** Shared heading without a <header>/<nav> that would inherit shell positioning. */
export default function WorkspaceTitle({module,eyebrow,title,description}:{module:keyof typeof moduleGuides;eyebrow:string;title:string;description:string}){
 const guide=moduleGuides[module];
 return <div className="workspace-title"><span className="workspace-title-icon" aria-hidden="true"><ModuleIcon name={module as ModuleIconName} size={27}/></span><div className="workspace-title-copy"><p className="eyebrow">{eyebrow}</p><h2 className="page-title">{title}</h2><p className="muted">{description}</p><details className="workspace-help"><summary><CircleHelp size={14}/> Guía rápida</summary><ol>{guide.map(step=><li key={step}>{step}</li>)}</ol></details></div></div>;
}
