import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSchedule, setSchedule, submitScheduled, verifyScheduled } from '../src/schedule.js';

const NOW = Date.parse('2026-10-28T12:00:00+08:00');
const title = '定时发布测试';
const future = () => new Date(Date.now() + 24 * 3600000 + 8 * 3600000)
  .toISOString().slice(0, 16) + ':00+08:00';
const card = (time, state = '待发布') => {
  const [y, m, d] = time.slice(0, 10).split('-').map(Number);
  return `${title}\n${y}年${m}月${d}日 ${time.slice(11, 16)}\n${state}`;
};
const managementPage = cards => ({
  url: () => 'https://creator.douyin.com/creator-micro/content/manage',
  waitForFunction: async () => {},
  $$eval: async (selector, fn, query) => fn(cards.map(innerText => ({ innerText })), query),
});

test('schedule window includes exactly two hours and fourteen days', () => {
  assert.equal(parseSchedule('2026-10-28T14:00:00+08:00', NOW).display, '2026-10-28 14:00');
  assert.equal(parseSchedule('2026-11-11T12:00:00+08:00', NOW).timestamp, NOW + 14 * 86400000);
  for (const value of ['2026-10-28T13:59:00+08:00', '2026-11-11T12:01:00+08:00']) {
    assert.throws(() => parseSchedule(value, NOW));
  }
});

test('rejects ambiguous timezone, non-minute times, and calendar rollover', () => {
  for (const value of [undefined, null, '2026-10-30 20:00', '2026-10-30T20:00:00Z',
    '2026-10-30T20:00:01+08:00', '2026-13-01T20:00:00+08:00']) {
    assert.throws(() => parseSchedule(value, NOW));
  }
  assert.throws(() => parseSchedule('2026-02-30T20:00:00+08:00', NOW, { validateWindow: false }));
});

test('existing works can still be verified inside the two-hour submission limit', async () => {
  const time = new Date(Date.now() + 3600000 + 8 * 3600000).toISOString().slice(0, 16) + ':00+08:00';
  assert.throws(() => parseSchedule(time));
  const result = await verifyScheduled(managementPage([card(time)]), { title, scheduleAt: time });
  assert.equal(result.ok, true);
  assert.equal(result.published, false);
});

test('management verification rejects duplicates, wrong times, published and missing works', async () => {
  const time = future();
  for (const cards of [[], [card(time), card(time)], [card(time, '已发布')], [card('2000-01-01T00:00:00+08:00')]]) {
    assert.equal((await verifyScheduled(managementPage(cards), { title, scheduleAt: time })).ok, false);
  }
});

test('read-back mismatch stops time configuration', async () => {
  const page = {
    $: async () => ({}), waitForSelector: async () => {}, click: async () => {},
    keyboard: { down: async () => {}, up: async () => {}, press: async () => {}, type: async () => {} },
    $eval: async () => '2026-01-01 00:00',
  };
  await assert.rejects(setSchedule(page, future()), /回读不一致/);
});

function editorPage(time, overrides = {}, destination = '/content/manage') {
  let clicks = 0;
  let submitted = false;
  const page = {
    ...managementPage([card(time)]),
    url: () => 'https://creator.douyin.com' + (submitted ? destination : '/content/post/video'),
    evaluate: async () => submitted
      ? { url: page.url(), text: '发布成功' }
      : { title, time: time.slice(0, 16).replace('T', ' '), scheduled: true, text: '', ...overrides },
    $$: async () => [{
      evaluate: async fn => fn({ innerText: '发布', disabled: false }),
      click: async () => { clicks++; submitted = true; },
    }],
    reload: async () => {},
  };
  return { page, clicks: () => clicks };
}

test('never clicks publish with immediate mode, wrong title/time, or an unfinished upload', async () => {
  const time = future();
  for (const state of [{ scheduled: false }, { title: '另一篇作品' }, { time: '错误时间' }, { text: '取消上传' }]) {
    const fake = editorPage(time, state);
    await assert.rejects(submitScheduled(fake.page, { title, scheduleAt: time }));
    assert.equal(fake.clicks(), 0);
  }
});

test('successful submission is verified on the platform and clicked only once', async () => {
  const time = future();
  const fake = editorPage(time);
  const result = await submitScheduled(fake.page, { title, scheduleAt: time });
  assert.equal(result.status, 'scheduled');
  assert.equal(result.published, false);
  assert.equal(fake.clicks(), 1);
});

test('success toast without a management record remains uncertain and is not retried', async () => {
  const time = future();
  const fake = editorPage(time, {}, '/content/post/image');
  const result = await submitScheduled(fake.page, { title, scheduleAt: time });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'submission_requires_verification');
  assert.equal(fake.clicks(), 1);
});
