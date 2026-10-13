import {describe,expect,it} from 'vitest';
import {clientReadiness,formatLatency,qualityLabel,qualityTone} from './quality';

describe('quality helpers',()=>{
 it('maps quality score bands',()=>{
  expect(qualityTone(100)).toBe('excellent');
  expect(qualityTone(90)).toBe('healthy');
  expect(qualityTone(75)).toBe('attention');
  expect(qualityTone(45)).toBe('risk');
  expect(qualityLabel('healthy')).toBe('Saludable');
 });
 it('scores client readiness deterministically',()=>{
  expect(clientReadiness({online:true,serviceWorkerSupported:true,serviceWorkerControlled:true,standalone:true,notifications:'granted'}).score).toBe(100);
  expect(clientReadiness({online:true,serviceWorkerSupported:true,serviceWorkerControlled:true,standalone:false,notifications:'default'}).score).toBe(65);
 });
 it('formats connection latency',()=>{
  expect(formatLatency(120)).toContain('excelente');
  expect(formatLatency(400)).toContain('normal');
  expect(formatLatency(900)).toContain('lento');
  expect(formatLatency(null)).toBe('Sin medición');
 });
});
