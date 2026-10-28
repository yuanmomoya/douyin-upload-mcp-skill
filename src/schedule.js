import { sleep } from './util.js';

const TITLE_INPUT = 'input[placeholder*="作品标题"]';
const TIME_INPUT = 'input[placeholder="日期和时间"]';
const CARD_SELECTOR = '[class*="video-card-content-"]';
const MIN_DELAY = 2 * 60 * 60 * 1000;
const MAX_DELAY = 14 * 24 * 60 * 60 * 1000;

/** Parse explicit Shanghai time; existing works need no submission-window check. */
export function parseSchedule(scheduleAt, now = Date.now(), { validateWindow = true } = {}) {
  if (typeof scheduleAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/.test(scheduleAt)) {
    throw new Error('scheduleAt须为含+08:00的整分钟ISO时间，例如2026-10-30T20:00:00+08:00');
  }
  const timestamp = Date.parse(scheduleAt);
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) !== scheduleAt.slice(0, 16)) {
    throw new Error('日历日期无效');
  }
  if (validateWindow && (timestamp - now < MIN_DELAY || timestamp - now > MAX_DELAY)) {
    throw new Error('定时必须为2小时后、14天内');
  }
  return { timestamp, display: scheduleAt.slice(0, 16).replace('T', ' '), scheduleAt };
}

/** Select scheduled mode and read the time back after blur. */
export async function setSchedule(page, scheduleAt) {
  const target = parseSchedule(scheduleAt);
  if (!await page.$(TIME_INPUT)) {
    let clicked = false;
    for (const element of await page.$$('label,span,div')) {
      if (await element.evaluate(el => el.children.length === 0 && el.textContent.trim() === '定时发布')) {
        await element.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) throw new Error('未找到定时发布选项');
  }
  await page.waitForSelector(TIME_INPUT, { timeout: 10000 });
  await page.click(TIME_INPUT);
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.type(target.display);
  await page.keyboard.press('Enter');
  await page.click(TITLE_INPUT);
  await sleep(300);
  const value = await page.$eval(TIME_INPUT, el => el.value);
  if (value !== target.display) throw new Error('定时时间回读不一致：' + value);
  return { ok: true, ...target };
}

/** Submit once. Inspect an uncertain result before retrying. */
export async function submitScheduled(page, { title, scheduleAt, evidencePath }) {
  const target = parseSchedule(scheduleAt);
  const state = await page.evaluate(({ titleInput, timeInput }) => ({
    title: document.querySelector(titleInput)?.value,
    time: document.querySelector(timeInput)?.value,
    scheduled: [...document.querySelectorAll('input:checked')].some(el => {
      const group = el.parentElement?.parentElement?.innerText || '';
      return el.value === '1' && group.includes('立即发布') && group.includes('定时发布');
    }),
    text: document.body.innerText,
  }), { titleInput: TITLE_INPUT, timeInput: TIME_INPUT });
  if (!title || state.title !== title || state.time !== target.display || !state.scheduled ||
      /已上传：|取消上传|上传失败/.test(state.text)) {
    throw new Error('提交前标题、时间、定时模式或上传状态核验失败');
  }
  if (evidencePath) await page.screenshot({ path: evidencePath, fullPage: true });

  let clicked = false;
  for (const button of await page.$$('button')) {
    if ((await button.evaluate(el => el.innerText)).trim() !== '发布') continue;
    if (await button.evaluate(el => el.disabled)) throw new Error('发布按钮禁用');
    await button.click();
    clicked = true;
    break;
  }
  if (!clicked) throw new Error('未找到发布按钮');
  await sleep(3000);
  if (page.url().includes('/content/manage')) {
    // Analytics/streaming connections can prevent networkidle2 from settling.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    return verifyScheduled(page, { title, scheduleAt });
  }
  const after = await page.evaluate(() => ({ url: location.href, text: document.body.innerText }));
  return { ok: false, status: 'submission_requires_verification', scheduleAt, title, after };
}

/** Verify platform records, never browser draft caches or success toasts alone. */
export async function verifyScheduled(page, { title, scheduleAt }) {
  const target = parseSchedule(scheduleAt, Date.now(), { validateWindow: false });
  const [year, month, day] = scheduleAt.slice(0, 10).split('-').map(Number);
  const expected = year + '年' + month + '月' + day + '日 ' + target.display.slice(11);
  if (!title || !page.url().includes('/content/manage')) {
    throw new Error('请先在作品管理页核验标题和时间，禁止以编辑缓存替代提交结果');
  }
  await page.waitForFunction(({ selector, title }) =>
    [...document.querySelectorAll(selector)].some(el => el.innerText.includes(title)),
  { timeout: 15000 }, { selector: CARD_SELECTOR, title }).catch(() => {});
  const cards = await page.$$eval(CARD_SELECTOR, (elements, title) =>
    elements.filter(el => el.innerText.includes(title)).map(el => el.innerText), title);
  if (cards.length !== 1 || !cards[0].includes(expected) || cards[0].includes('已发布') ||
      !/审核中|定时发布|待发布/.test(cards[0])) {
    return { ok: false, status: 'schedule_unverified', title, scheduleAt, cards };
  }
  return {
    ok: true, status: 'scheduled', title, scheduleAt, scheduled: true, published: false,
    platformStatus: cards[0].includes('审核中') ? '审核中' : '待发布',
    evidence: cards[0],
  };
}
