import {describe, expect, it} from 'vitest';
import {memberFlows, settlementSummary} from './settlements';
describe('settling shared expenses between members', () => {
  it('computes who owes whom and nets recorded payments', () => {
    const flows = [
      {user_id: 'a', paid: 1000, assigned: 600},
      {user_id: 'b', paid: 200, assigned: 600}
    ];
    const open = settlementSummary(flows, []);
    expect(open.balances).toEqual([
      {user_id: 'a', balance: 400},
      {user_id: 'b', balance: -400}
    ]);
    expect(open.suggestions).toEqual([{from_user_id: 'b', to_user_id: 'a', amount: 400}]);
    const partly = settlementSummary(flows, [{from_user_id: 'b', to_user_id: 'a', amount: 150.5}]);
    expect(partly.suggestions).toEqual([{from_user_id: 'b', to_user_id: 'a', amount: 249.5}]);
    expect(settlementSummary(flows, [{from_user_id: 'b', to_user_id: 'a', amount: 400}]).suggestions).toEqual([]);
  });
  it('settles three people with the fewest transfers and ignores strangers', () => {
    const s = settlementSummary(
      [
        {user_id: 'a', paid: 900, assigned: 300},
        {user_id: 'b', paid: 0, assigned: 300},
        {user_id: 'c', paid: 0, assigned: 300}
      ],
      [{from_user_id: 'x', to_user_id: 'a', amount: 50}]
    );
    expect(s.suggestions).toEqual([
      {from_user_id: 'b', to_user_id: 'a', amount: 300},
      {from_user_id: 'c', to_user_id: 'a', amount: 300}
    ]);
  });
  it('builds flows only from shared expenses with stored splits', () => {
    const tx = [
      {id: 't1', type: 'expense', amount: 100, paid_by: 'a', is_shared: true},
      {id: 't2', type: 'expense', amount: 50, paid_by: 'b', is_shared: false},
      {id: 't3', type: 'income', amount: 999, paid_by: 'a'}
    ];
    const splits = [
      {transaction_id: 't1', user_id: 'a', share_amount: 50},
      {transaction_id: 't1', user_id: 'b', share_amount: 50},
      {transaction_id: 't2', user_id: 'b', share_amount: 50}
    ];
    expect(memberFlows(['a', 'b'], tx, splits)).toEqual([
      {user_id: 'a', paid: 100, assigned: 50},
      {user_id: 'b', paid: 0, assigned: 50}
    ]);
  });
});
