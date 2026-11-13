// ==UserScript==
// @name         nonag-tiktoks
// @namespace    https://github.com/arxodeus/nonag-tiktoks
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/arxodeus/nonag-tiktoks/main/nonag-tiktoks.user.js
// @downloadURL  https://raw.githubusercontent.com/arxodeus/nonag-tiktoks/main/nonag-tiktoks.user.js
// @match        *://www.tiktok.com/*
// @run-at       document-start
// @license      EUPL-1.2+
// ==/UserScript==

// no ampersands, angle brackets, carets, asterisks, backslashes or backticks

function hide(el) {
  el.style.setProperty('display', 'none', 'important');
}

function textOf(el) {
  return (el.innerText || el.textContent || '').trim().toLowerCase();
}

function above(x, limit) {
  return Math.max(x, limit) !== limit;
}

function isDigits(s) {
  if (!s) return false;
  for (const c of s) {
    if ('0123456789'.indexOf(c) === -1) return false;
  }
  return true;
}

function videoId(path) {
  const p = path.split('?')[0].split('/');
  if (p[2] !== 'video') return null;
  if (!isDigits(p[3])) return null;
  return p[3];
}

function load(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

const isMobile = window.matchMedia('(max-width: 767px)').matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);
const isPlayer = location.pathname.split('/')[1] === 'player';
const currentId = videoId(location.pathname);

// tiktok shows the "watch now" card, which unmutes, while these keys are set
function forgetAppJump() {
  try {
    for (const store of [sessionStorage, localStorage]) {
      store.removeItem('ONE_LINK_DATA_KEY');
      store.removeItem('UNIFYING_ONE_LINK_POPUP');
    }
  } catch (e) {}
}

forgetAppJump();
window.addEventListener('visibilitychange', forgetAppJump, true);

// hidden with css so they never flash, the related lists stay in the page for swiping
const hideSelectors = [
  '#login-modal',
  '[data-e2e="login-modal"]',
  '[data-e2e="top-banner"]',
  '[data-e2e="bottom-banner"]',
  '.launch-popup-sheet-host',
  '.tux-base-dialog:has([data-e2e="returning-popup-open"])',
  '[data-e2e="middle-cta-container"]',
  '[data-e2e="open-titok-icon"]',
  '[data-e2e="recommend-list-tab-container"]',
  '[data-e2e="recommend-list"]',
  '[data-e2e="v2t-title"]',
  '[data-e2e="v2t-desc"]',
  '[data-e2e="v2t-keywords"]'
];
const style = document.createElement('style');
style.textContent = hideSelectors.join(', ') + ' { display: none !important; }';
(document.head || document.documentElement).appendChild(style);

const nagPhrases = ['open tiktok', 'open the tiktok', 'watch on tiktok', 'open app', 'open the app', 'watch in app', 'watch in the app', 'watch on the app', 'get the app', 'get the full app', 'continue in app', 'log in to see', 'log in to continue', 'log in to watch', 'log in to follow'];
const cookieButtons = ['decline optional cookies', 'decline all', 'reject all', 'only allow essential cookies'];

// only unlock the page once a modal was actually removed
let removedModal = false;

function isNag(text) {
  if (above(text.length, 60)) return false;
  for (const p of nagPhrases) {
    if (text.indexOf(p) !== -1) return true;
  }
  return false;
}

function mentionsCaptcha(el) {
  const s = (el.id + ' ' + String(el.className)).toLowerCase();
  return s.indexOf('captcha') !== -1;
}

function inCaptcha(el) {
  let x = el;
  while (x) {
    if (mentionsCaptcha(x)) return true;
    x = x.parentElement;
  }
  return false;
}

function captchaShowing() {
  for (const el of document.querySelectorAll('[id]')) {
    if (mentionsCaptcha(el)) return true;
  }
  return false;
}

function overlayFor(el) {
  let box = el;
  for (let i = 0; i !== 12; i++) {
    if (!box) return null;
    if (box === document.body) return null;
    const pos = getComputedStyle(box).position;
    if (pos === 'fixed' || pos === 'sticky') return box;
    box = box.parentElement;
  }
  return null;
}

// the modal's full-screen container eats clicks, so hide that too
function hideLoginModal() {
  const m = document.getElementById('login-modal');
  if (!m) return;
  removedModal = true;
  const box = overlayFor(m);
  if (box) hide(box);
}

// tiktok's own dismiss buttons unlock the page properly, so click them,
// except the "watch now" card's close button, which unmutes
function dismissPopups() {
  const buttons = [
    document.querySelector('[data-e2e="launch-popup-close"]'),
    document.querySelector('[data-e2e="alt-middle-cta-cancel-btn"]')
  ];
  for (const b of buttons) {
    if (!b) continue;
    if (b.dataset.nonag) continue;
    b.dataset.nonag = '1';
    b.click();
  }
}

// "watch on tiktok" on mobile is an h3 in a fixed bar, not a button
function hideTextNags() {
  for (const b of document.querySelectorAll('button, a, [role=button], h3')) {
    if (b.dataset.nonag) continue;
    if (!isNag(textOf(b))) continue;
    b.dataset.nonag = '1';
    if (inCaptcha(b)) continue;
    const box = overlayFor(b);
    if (box) {
      if (box.querySelector('video')) continue;
      hide(box);
      removedModal = true;
    } else {
      hide(b);
    }
  }
}

// the cookie banner lives in a shadow root, out of reach of querySelectorAll
function declineCookies() {
  const host = document.querySelector('tiktok-cookie-banner');
  if (!host) return;
  if (host.dataset.nonag) return;
  host.dataset.nonag = '1';
  const root = host.shadowRoot;
  if (root) {
    for (const b of root.querySelectorAll('button')) {
      if (cookieButtons.indexOf(textOf(b)) === -1) continue;
      b.click();
      return;
    }
  }
  hide(host);
}

// the login modal locks scrolling, marks the app inert and sets
// pointer-events: none on #app, so undo all three
function unlockPage() {
  if (!removedModal) return;
  if (captchaShowing()) return;
  for (const el of [document.documentElement, document.body]) {
    if (getComputedStyle(el).overflow === 'hidden') el.style.setProperty('overflow', 'auto', 'important');
  }
  for (const el of document.querySelectorAll('[inert]')) {
    if (el.querySelector('#login-modal')) continue;
    el.inert = false;
  }
  const app = document.getElementById('app');
  if (app) app.style.setProperty('pointer-events', 'auto', 'important');
}

// the login modal leaves the desktop video paused, so start it once
function playVideos() {
  for (const v of document.querySelectorAll('video')) {
    if (!v.loop) v.loop = true;
    if (v.dataset.nonag) continue;
    if (!v.currentSrc) continue;
    v.dataset.nonag = '1';
    if (!currentId) continue;
    v.play().catch(function () {});
  }
}

// tiktok pauses at the end to show the overlay; restart from the top
function keepPlaying() {
  for (const v of document.querySelectorAll('video')) {
    if (!v.paused) continue;
    if (!v.duration) continue;
    if (Math.max(v.currentTime, v.duration - 0.3) !== v.currentTime) continue;
    v.currentTime = 0;
    v.play().catch(function () {});
  }
}

// on "ended" the mobile page swaps in an end screen, so keep it from tiktok
function swallowEnded(e) {
  if (!currentId) return;
  if (!e.target) return;
  if (e.target.tagName !== 'VIDEO') return;
  e.stopImmediatePropagation();
}

// if the end screen shows anyway, press "watch again"
function watchAgain() {
  if (!currentId) return;
  if (!document.querySelector('.swiper-horizontal')) return;
  // the last match is the innermost element, the one tiktok listens on
  let button = null;
  for (const el of document.querySelectorAll('button, [role=button], div')) {
    if (textOf(el) !== 'watch again') continue;
    if (!el.getBoundingClientRect().height) continue;
    button = el;
  }
  if (!button) return;
  button.click();
  for (const v of document.querySelectorAll('video')) v.play().catch(function () {});
}

// tiktok's "see more" has no way back, so tapping an expanded caption folds it
function onCaptionTap(e) {
  const desc = e.target.closest ? e.target.closest('[data-e2e="video-desc"]') : null;
  if (!desc) return;
  if (e.target.closest('a, button')) return;
  if (desc.querySelector('[data-e2e="video-desc-see-more"]')) return;
  if (desc.dataset.nonagFolded) {
    delete desc.dataset.nonagFolded;
    desc.style.removeProperty('max-height');
    desc.style.removeProperty('overflow');
  } else {
    desc.dataset.nonagFolded = '1';
    desc.style.setProperty('max-height', '4.5em', 'important');
    desc.style.setProperty('overflow', 'hidden', 'important');
  }
}

function stretch(el) {
  el.style.setProperty('height', '100dvh', 'important');
  el.style.setProperty('max-height', 'none', 'important');
}

// with the related grid hidden, stretch the video and caption overlay to the
// full screen like the app
function fillScreen() {
  if (!isMobile) return;
  if (!currentId) return;
  const v = document.querySelector('video');
  if (!v) return;
  if (v.dataset.nonagFull) return;
  const vh = v.getBoundingClientRect().height;
  if (!vh) return;
  const desc = document.querySelector('[data-e2e="video-desc"]');
  if (!desc) return;
  v.dataset.nonagFull = '1';
  let card = null;
  let x = v;
  while (x) {
    if (x === document.body) break;
    if (above(2, Math.abs(x.getBoundingClientRect().height - vh))) {
      stretch(x);
      card = x;
    }
    x = x.parentElement;
  }
  document.body.style.setProperty('background', 'black', 'important');
  if (!card) return;
  x = desc.parentElement;
  while (x) {
    if (x === card) break;
    if (x === document.body) break;
    if (!above(vh, x.getBoundingClientRect().height / 0.75)) stretch(x);
    x = x.parentElement;
  }
}

// logged out there's no feed, so swiping walks each video's related videos
const seen = load('nonagSeen', []);
if (currentId) {
  if (seen.indexOf(currentId) === -1) seen.push(currentId);
  save('nonagSeen', seen.slice(-500));
}
let queue = currentId ? load('nonagNext' + currentId, []) : [];
let navigating = false;

function collectRelated() {
  if (!currentId) return;
  if (queue.length) return;
  const found = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href').split('?')[0];
    const id = videoId(href.replace('https://www.tiktok.com', ''));
    if (!id) continue;
    if (id === currentId) continue;
    if (found.indexOf(href) !== -1) continue;
    found.push(href);
  }
  if (!found.length) return;
  queue = found;
  save('nonagNext' + currentId, queue);
}

// desktop: once we have the related list, show comments in the side panel
function showComments() {
  if (isMobile) return;
  if (!queue.length) return;
  for (const b of document.querySelectorAll('button')) {
    if (b.dataset.nonag) continue;
    if (textOf(b) !== 'comments') continue;
    b.dataset.nonag = '1';
    b.click();
  }
}

function goNext() {
  if (navigating) return;
  if (!currentId) return;
  for (const href of queue) {
    if (seen.indexOf(videoId(href)) !== -1) continue;
    navigating = true;
    const back = load('nonagBack', []);
    back.push(location.pathname);
    save('nonagBack', back.slice(-200));
    location.href = href;
    return;
  }
}

function goBack() {
  if (navigating) return;
  const back = load('nonagBack', []);
  const prev = back.pop();
  if (!prev) return;
  navigating = true;
  save('nonagBack', back);
  location.href = prev;
}

// don't treat scrolling the comments panel as a swipe
function inScrollable(el) {
  let x = el;
  while (x) {
    if (x === document.body) return false;
    if (x === document.documentElement) return false;
    const oy = getComputedStyle(x).overflowY;
    if (oy === 'auto' || oy === 'scroll') {
      if (above(x.scrollHeight, x.clientHeight + 4)) return true;
    }
    x = x.parentElement;
  }
  return false;
}

let touchX = 0;
let touchY = 0;
let touchOk = false;

function onTouchStart(e) {
  if (!currentId) return;
  const t = e.changedTouches[0];
  touchX = t.clientX;
  touchY = t.clientY;
  touchOk = !inScrollable(e.target);
}

function onTouchEnd(e) {
  if (!touchOk) return;
  const t = e.changedTouches[0];
  const dx = Math.abs(t.clientX - touchX);
  const dy = touchY - t.clientY;
  if (above(dx, Math.abs(dy))) return;
  if (above(dy, 80)) goNext();
  if (above(0 - dy, 80)) goBack();
}

let wheelSum = 0;
let wheelTimer = 0;

function onWheel(e) {
  if (!currentId) return;
  if (isMobile) return;
  if (inScrollable(e.target)) return;
  wheelSum = wheelSum + e.deltaY;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(function () { wheelSum = 0; }, 300);
  if (above(wheelSum, 120)) goNext();
  if (above(0 - wheelSum, 120)) goBack();
}

function onKey(e) {
  if (!currentId) return;
  const t = e.target;
  if (t.isContentEditable) return;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopImmediatePropagation();
    goNext();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopImmediatePropagation();
    goBack();
  }
}

// tiktok's up and down arrows next to the video are disabled when logged out
function hookArrows() {
  for (const sel of ['[data-e2e="feed-navigation-next"]', '[data-e2e="feed-navigation-prev"]']) {
    const b = document.querySelector(sel);
    if (!b) continue;
    if (b.disabled) b.disabled = false;
    b.setAttribute('aria-disabled', 'false');
    b.style.setProperty('pointer-events', 'auto', 'important');
    b.style.setProperty('opacity', '1', 'important');
  }
}

function onClick(e) {
  if (!currentId) return;
  if (!e.target.closest) return;
  if (e.target.closest('[data-e2e="feed-navigation-next"]')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    goNext();
    return;
  }
  if (e.target.closest('[data-e2e="feed-navigation-prev"]')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    goBack();
    return;
  }
  onCaptionTap(e);
}

window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
window.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
window.addEventListener('wheel', onWheel, { capture: true, passive: true });
window.addEventListener('keydown', onKey, true);
window.addEventListener('click', onClick, true);
window.addEventListener('ended', swallowEnded, true);

const barHeight = 14;
const bars = new Map();

function makeBar(v) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position: fixed; z-index: 2147483647; height: ' + barHeight + 'px; cursor: pointer; touch-action: none; display: none;';
  const track = document.createElement('div');
  track.style.cssText = 'position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255, 255, 255, 0.3);';
  const fill = document.createElement('div');
  fill.style.cssText = 'width: 100%; height: 100%; background: #fff; transform-origin: left; transform: scaleX(0);';
  track.append(fill);
  bar.append(track);
  document.body.append(bar);

  let dragging = false;

  function stop(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  function seek(e) {
    const r = bar.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
    v.currentTime = v.duration / (r.width / x);
  }

  bar.addEventListener('pointerdown', function (e) {
    stop(e);
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    seek(e);
  });

  bar.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    stop(e);
    seek(e);
  });

  for (const type of ['pointerup', 'pointercancel']) {
    bar.addEventListener(type, function (e) {
      stop(e);
      dragging = false;
    });
  }

  for (const type of ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
    bar.addEventListener(type, stop);
  }

  return { bar: bar, fill: fill };
}

// the desktop player has its own progress bar
function findVideos() {
  if (!isMobile) return;
  for (const v of document.querySelectorAll('video')) {
    if (!bars.has(v)) bars.set(v, makeBar(v));
  }
}

function onScreen(v, r) {
  if (!v.duration) return false;
  if (!isFinite(v.duration)) return false;
  if (!r.width) return false;
  if (Math.max(r.bottom, 0) === 0) return false;
  return Math.min(r.top, innerHeight) !== innerHeight;
}

// the video is stretched to 100dvh, so keep the bar inside the viewport
function drawBars() {
  for (const [v, b] of bars) {
    if (!v.isConnected) {
      b.bar.remove();
      bars.delete(v);
      continue;
    }
    const r = v.getBoundingClientRect();
    if (!onScreen(v, r)) {
      b.bar.style.display = 'none';
      continue;
    }
    b.bar.style.display = 'block';
    b.bar.style.left = r.left + 'px';
    b.bar.style.top = Math.min(r.bottom, innerHeight) - barHeight + 'px';
    b.bar.style.width = r.width + 'px';
    b.fill.style.transform = 'scaleX(' + v.currentTime / v.duration + ')';
  }
  requestAnimationFrame(drawBars);
}

function clean() {
  if (!document.body) return;
  findVideos();
  playVideos();
  if (isPlayer) return;
  dismissPopups();
  hideLoginModal();
  hideTextNags();
  declineCookies();
  unlockPage();
  collectRelated();
  fillScreen();
  watchAgain();
  showComments();
  hookArrows();
}

new MutationObserver(clean).observe(document, { childList: true, subtree: true });
setInterval(function () {
  clean();
  keepPlaying();
}, 500);
requestAnimationFrame(drawBars);
