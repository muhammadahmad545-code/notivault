import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCode } from './otp';
import { matchRule, parseKeywords, validateRule } from './rules';
import type { PulseRule } from './rules';

test('finds codes in common verification messages', () => {
  assert.equal(extractCode('Google', 'G-482913 is your Google verification code.'), '482913');
  assert.equal(extractCode('HBL', 'Your OTP for login is 7391. Do not share it.'), '7391');
  assert.equal(extractCode('WhatsApp', 'Your WhatsApp code: 123-456'), '123456');
  assert.equal(extractCode('Bank', 'Use 55 019 284 as PIN'), null);
});

test('ignores messages that are not about codes, and years', () => {
  assert.equal(extractCode('Ali', 'Meet at 1830 near gate 4'), null);
  assert.equal(extractCode('Statement', 'Your 2026 statement and verification summary'), null);
  assert.equal(extractCode('Order', 'Order 12345678901 shipped. Track with code below'), null);
});

const rule = (over: Partial<PulseRule>): PulseRule => ({ id: 'r', name: 'R', enabled: true, apps: [], keywords: [], action: 'mute', ...over });

test('rules match on app and keyword, first match wins', () => {
  const rules = [
    rule({ id: 'a', apps: ['com.whatsapp'], keywords: ['urgent'], action: 'alert' }),
    rule({ id: 'b', apps: ['com.whatsapp'], action: 'digest' }),
    rule({ id: 'c', keywords: ['sale', 'offer'], action: 'mute' }),
  ];
  assert.equal(matchRule(rules, 'com.whatsapp', 'Mom', 'URGENT call me')?.id, 'a');
  assert.equal(matchRule(rules, 'com.whatsapp', 'Group', 'lunch?')?.id, 'b');
  assert.equal(matchRule(rules, 'com.daraz', 'Mega Sale', '50% off')?.id, 'c');
  assert.equal(matchRule(rules, 'com.daraz', 'Delivered', 'Your parcel'), null);
  assert.equal(matchRule([rule({ enabled: false })], 'x', 'y', 'z'), null);
});

test('keywords are trimmed and de-duplicated; empty rules are rejected', () => {
  assert.deepEqual(parseKeywords(' sale, offer ,,sale '), ['sale', 'offer']);
  assert.match(validateRule(rule({})) ?? '', /at least one app or keyword/);
  assert.equal(validateRule(rule({ keywords: ['x'] })), null);
});
