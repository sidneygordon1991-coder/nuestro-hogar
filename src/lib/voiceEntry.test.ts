import {describe, expect, it} from 'vitest';
import {parseSpokenEntry, spokenAmount, spokenDate, wordsToNumber} from './voiceEntry';

const today = '2026-10-18'; // domingo

describe('voice entry parser', () => {
  it('reads amounts in digits and in words', () => {
    expect(spokenAmount('gasté 1,250.50 en la farmacia')?.amount).toBe(1250.5);
    expect(spokenAmount('Q185 del súper')?.amount).toBe(185);
    expect(spokenAmount('ciento ochenta y cinco quetzales')?.amount).toBe(185);
    expect(spokenAmount('mil doscientos en colegiatura')?.amount).toBe(1200);
    expect(spokenAmount('veinticinco con 50 de pan')?.amount).toBe(25.5);
    expect(wordsToNumber(['dos', 'mil', 'quinientos'])).toBe(2500);
    expect(spokenAmount('compré pan')).toBeNull();
    expect(spokenAmount('compré una pizza por 85')?.amount).toBe(85);
  });
  it('reads relative dates without going into the future', () => {
    expect(spokenDate('ayer', today).date).toBe('2026-10-17');
    expect(spokenDate('antier', today).date).toBe('2026-10-16');
    expect(spokenDate('el lunes', today).date).toBe('2026-10-12');
    expect(spokenDate('el domingo', today).date).toBe('2026-10-11');
    expect(spokenDate('el 15', today).date).toBe('2026-10-15');
    expect(spokenDate('el 25', today).date).toBe('2026-09-25');
    expect(spokenDate('nada', today)).toEqual({date: today, match: null});
    expect(spokenDate('el 31', '2026-11-18').date).toBe('2026-10-31');
    expect(spokenDate('el 30', '2026-03-05').date).toBe('2026-02-28');
    expect(parseSpokenEntry('pagué el 1,500 de la luz', today)).toMatchObject({amount: 1500, date: today});
  });
  it('builds a movement draft from a sentence', () => {
    expect(parseSpokenEntry('Gasté 185 en el súper ayer', today)).toEqual({
      type: 'expense',
      amount: 185,
      currency: 'GTQ',
      description: 'Súper',
      date: '2026-10-17'
    });
    expect(parseSpokenEntry('me pagaron 4,500 de salario', today)).toMatchObject({
      type: 'income',
      amount: 4500,
      description: 'Salario'
    });
    expect(parseSpokenEntry('pagué cincuenta dólares de Netflix el lunes', today)).toEqual({
      type: 'expense',
      amount: 50,
      currency: 'USD',
      description: 'Netflix',
      date: '2026-10-12'
    });
    expect(parseSpokenEntry('el 15 pagué 350 de luz', today)).toMatchObject({
      amount: 350,
      date: '2026-10-15',
      description: 'Luz'
    });
    expect(parseSpokenEntry('compré una pizza por 85', today)).toMatchObject({amount: 85, description: 'Pizza'});
    expect(parseSpokenEntry('taxi', today)).toMatchObject({amount: null, description: 'Taxi', date: today});
  });
});
