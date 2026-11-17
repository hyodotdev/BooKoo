import {memberActionPlan} from '../../../../src/features/ledger/memberActions';

describe('member management action plan', () => {
  test('gives owners transfer, administrator, and removal actions', () => {
    expect(memberActionPlan('OWNER', 'MEMBER', false)).toEqual({
      leading: ['TRANSFER_OWNERSHIP', 'ASSIGN_ADMIN'],
      trailing: ['REMOVE_MEMBER'],
    });
    expect(memberActionPlan('OWNER', 'ADMIN', false)).toEqual({
      leading: ['TRANSFER_OWNERSHIP', 'REMOVE_ADMIN'],
      trailing: ['REMOVE_MEMBER'],
    });
    expect(memberActionPlan('OWNER', 'VIEWER', false)).toEqual({
      leading: ['ASSIGN_ADMIN'],
      trailing: ['REMOVE_MEMBER'],
    });
  });

  test('lets administrators switch only lower roles', () => {
    expect(memberActionPlan('ADMIN', 'MEMBER', false)).toEqual({
      leading: ['MAKE_VIEWER'],
      trailing: ['REMOVE_MEMBER'],
    });
    expect(memberActionPlan('ADMIN', 'VIEWER', false)).toEqual({
      leading: ['MAKE_MEMBER'],
      trailing: ['REMOVE_MEMBER'],
    });
  });

  test('never reveals actions for self or equal and higher roles', () => {
    expect(memberActionPlan('OWNER', 'MEMBER', true)).toEqual({
      leading: [],
      trailing: [],
    });
    expect(memberActionPlan('ADMIN', 'ADMIN', false)).toEqual({
      leading: [],
      trailing: [],
    });
    expect(memberActionPlan('MEMBER', 'VIEWER', false)).toEqual({
      leading: [],
      trailing: [],
    });
  });
});
