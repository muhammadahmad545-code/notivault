import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, formatMoney, parseMoney } from './money';

test('reads common debit alerts', () => {
  const a = parseMoney('Meezan Bank', 'PKR 1,500.00 debited from your A/C **1234 on 23-Nov at DARAZ ONLINE. Avl Bal PKR 20,000');
  assert.deepEqual(a, { amount: 1500, currency: 'Rs', direction: 'out', counterparty: 'DARAZ ONLINE' });
  const b = parseMoney('JazzCash', 'You have sent Rs. 500.00 to Ahmad Ali via Raast. TID 1234');
  assert.equal(b?.amount, 500);
  assert.equal(b?.direction, 'out');
  assert.equal(b?.counterparty, 'Ahmad Ali');
  assert.equal(parseMoney('Card', 'Your card was charged $12.99 at Netflix')?.amount, 12.99);
});

test('reads credits', () => {
  const c = parseMoney('Easypaisa', 'You have received Rs 2,000 from Sara Khan in your Easypaisa account.');
  assert.deepEqual(c, { amount: 2000, currency: 'Rs', direction: 'in', counterparty: 'Sara Khan' });
  assert.equal(parseMoney('HBL', 'Your account has been credited with 45,000 PKR salary.')?.direction, 'in');
});

test('ignores promotions, codes, bills and plain chat', () => {
  assert.equal(parseMoney('Daraz', 'Mega sale! Get up to Rs 500 off on your first order'), null);
  assert.equal(parseMoney('Bank', 'Your OTP for the payment of Rs 500 is 482913'), null);
  assert.equal(parseMoney('K-Electric', 'Your bill of Rs 3,200 is due on 25 Nov'), null);
  assert.equal(parseMoney('Ali', 'I paid for lunch yesterday'), null);
  assert.equal(parseMoney('Bank', 'Transaction of Rs 900 declined at Foodpanda'), null);
});

test('formats money and CSV cells', () => {
  assert.equal(formatMoney(1500, 'Rs'), 'Rs 1,500');
  assert.equal(formatMoney(12.5, '$'), '$12.50');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
});
