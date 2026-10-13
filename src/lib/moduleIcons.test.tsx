import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import ModuleIcon,{type ModuleIconName} from '../ModuleIcon';

const modules:ModuleIconName[]=['home','finance','calendar','lists','family','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics'];
describe('consistent detailed module icons',()=>{
 it.each(modules)('%s is a scalable themed object without image requests or duplicate SVG IDs',name=>{
  const svg=renderToStaticMarkup(<ModuleIcon name={name} size={28}/>);
  expect(svg).toContain('viewBox="0 0 32 32"');
  expect(svg).toContain('stroke="currentColor"');
  expect(svg).toContain('nh-icon-detail');
  expect(svg).toContain('width="28"');
  expect(svg).toContain('aria-hidden="true"');
  expect(svg).not.toMatch(/<image|<img|\sid=|#[\da-f]{6}/);
 });
});
