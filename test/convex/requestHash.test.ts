import {requestHash} from '../../convex/lib/requestHash';

describe('Convex durable request hash', () => {
  it('is stable across object key order and omitted undefined fields', () => {
    const first = requestHash('ITEM_UPDATE', {
      itemId: 'item-1',
      memo: 'coffee',
      categoryKey: undefined,
      place: {lng: 127, label: 'Seoul', lat: 37},
    });
    const second = requestHash('ITEM_UPDATE', {
      place: {lat: 37, label: 'Seoul', lng: 127},
      memo: 'coffee',
      itemId: 'item-1',
    });
    expect(first).toBe(second);
  });

  it('changes across operations and meaningful values', () => {
    expect(requestHash('ITEM_CREATE', {memo: 'a'})).not.toBe(
      requestHash('ITEM_UPDATE', {memo: 'a'}),
    );
    expect(requestHash('ITEM_CREATE', {memo: 'a'})).not.toBe(
      requestHash('ITEM_CREATE', {memo: 'b'}),
    );
  });
});
