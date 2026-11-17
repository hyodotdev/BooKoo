(() => {
  const requested = new URLSearchParams(window.location.search).get('lang');
  const paths = {"de":"/de","en":"/en","es":"/es","fr":"/fr","id":"/id","it":"/it","ja":"/ja","ko":"/","nl":"/nl","pt":"/pt","vi":"/vi","zh":"/zh-Hans","zh-Hant":"/zh-Hant"};
  const remember = (value) => { try { window.localStorage.setItem('bookoo.lang', value); } catch (error) {} };
  const stored = (() => { try { return window.localStorage.getItem('bookoo.lang'); } catch (error) { return null; } })();
  document.addEventListener('click', (event) => { const link = event.target && event.target.closest ? event.target.closest('[data-lang-link]') : null; if (link) remember(link.dataset.langLink); });
  if (requested && Object.hasOwn(paths, requested)) { remember(requested); window.location.replace(paths[requested] + window.location.hash); return; }
  if (document.body.dataset.locale !== 'ko' || /bot|crawl|spider|slurp|preview|scrap|lighthouse/i.test(navigator.userAgent || '')) return;
  const pick = (tag) => { const value = String(tag).toLowerCase(); if (value.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(value) ? 'zh-Hant' : 'zh'; const primary = value.split('-')[0]; return Object.hasOwn(paths, primary) ? primary : undefined; };
  const preferred = stored && Object.hasOwn(paths, stored) ? stored : (navigator.languages || [navigator.language || 'ko']).map(pick).find(Boolean);
  if (preferred && preferred !== 'ko') window.location.replace(paths[preferred] + window.location.hash);
})();
