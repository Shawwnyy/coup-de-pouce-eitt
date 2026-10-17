/* Applique le thème enregistré localement avant le rendu de React (évite le flash). */
(function () {
  try {
    var raw = localStorage.getItem('cdp.prefs');
    if (!raw) return;
    var p = JSON.parse(raw);
    var t = p && p.theme;
    if (t === 'light' || t === 'dark' || t === 'eitt' || t === 'custom') {
      document.documentElement.setAttribute('data-theme', t);
    }
    if (t === 'custom' && p.custom && p.custom.vars) {
      var v = p.custom.vars, s = document.documentElement.style;
      for (var k in v) if (/^--[a-z0-9-]+$/.test(k) && /^[#a-z0-9(),.%\s-]+$/i.test(String(v[k]))) s.setProperty(k, v[k]);
      var bg = p.custom.bgStyle;
      // « image » : l'image perso est appliquée par l'application une fois chargée (jamais ici).
      if (bg === 'grid' || bg === 'aurora' || bg === 'gradient' || bg === 'none') {
        document.documentElement.setAttribute('data-bg', bg);
      }
    }
  } catch (e) { /* stockage indisponible : thème par défaut */ }
})();
