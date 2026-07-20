(function () {
  const state = {
    speciesList: [],
    filtered: [],
    renderedCount: 0,
    batchSize: 40,
    search: '',
    activeTypes: new Set(),
    typeNameSets: {},
    category: '',
    genusById: {},
  };

  const grid = document.getElementById('catalogue-grid');
  const statusEl = document.getElementById('grid-status');
  const resultCountEl = document.getElementById('result-count');
  const sentinel = document.getElementById('sentinel');
  const searchInput = document.getElementById('search-input');
  const typeChipsEl = document.getElementById('type-chips');
  const categoryChipsEl = document.getElementById('category-chips');
  const categoryLoadingEl = document.getElementById('category-loading');

  const modalOverlay = document.getElementById('modal-overlay');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');

  let cardObserver;
  let scrollObserver;
  let genusDiscoveryStarted = false;
  let refreshTimer = null;
  let searchTimer = null;

  init();

  async function init() {
    buildTypeChips();
    buildCategoryChips();
    setupObservers();
    bindControls();
    bindModal();

    statusEl.textContent = 'Loading Pokédex…';
    try {
      state.speciesList = await PokeAPI.getSpeciesList();
    } catch (err) {
      statusEl.textContent = '';
      grid.innerHTML = '<div class="error-banner">Couldn\'t reach PokéAPI. Check your connection and reload the page.</div>';
      return;
    }
    statusEl.textContent = '';
    applyFilters();
    ensureGenusDiscovery();
  }

  // ---------- Observers ----------

  function setupObservers() {
    cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = Number(entry.target.dataset.id);
          cardObserver.unobserve(entry.target);
          loadCardDetail(id, entry.target);
        }
      });
    }, { rootMargin: '250px 0px' });

    scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) renderNextBatch();
    }, { rootMargin: '400px 0px' });
    scrollObserver.observe(sentinel);
  }

  // ---------- Controls ----------

  function buildTypeChips() {
    TYPE_ORDER.forEach((type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = type;
      btn.style.background = typeColor(type);
      btn.dataset.type = type;
      btn.addEventListener('click', () => onTypeChipClick(type, btn));
      typeChipsEl.appendChild(btn);
    });
  }

  async function onTypeChipClick(type, btn) {
    if (state.activeTypes.has(type)) {
      state.activeTypes.delete(type);
      btn.classList.remove('active');
      applyFilters();
      return;
    }
    state.activeTypes.add(type);
    btn.classList.add('active');

    if (!state.typeNameSets[type]) {
      btn.classList.add('loading');
      try {
        state.typeNameSets[type] = await PokeAPI.getPokemonNamesForType(type);
      } catch (err) {
        state.activeTypes.delete(type);
        btn.classList.remove('active', 'loading');
        return;
      }
      btn.classList.remove('loading');
    }
    applyFilters();
  }

  function bindControls() {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = searchInput.value;
        applyFilters();
      }, 200);
    });
  }

  // ---------- Category chips ----------

  function buildCategoryChips() {
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'chip category active';
    allChip.textContent = 'All';
    allChip.dataset.category = '';
    allChip.addEventListener('click', () => onCategoryChipClick('', allChip));
    categoryChipsEl.appendChild(allChip);
  }

  function onCategoryChipClick(genus, btn) {
    state.category = genus;
    categoryChipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  }

  // ---------- Genus / category discovery ----------

  function ensureGenusDiscovery() {
    if (genusDiscoveryStarted) return;
    genusDiscoveryStarted = true;
    runGenusDiscovery();
  }

  async function runGenusDiscovery() {
    const CONCURRENCY = 6;
    const queue = state.speciesList.filter((p) => !(p.id in state.genusById));
    if (!queue.length) return;
    categoryLoadingEl.hidden = false;
    let idx = 0;

    async function worker() {
      while (idx < queue.length) {
        const p = queue[idx++];
        try {
          const species = await PokeAPI.getSpecies(p.id);
          recordGenus(p.id, species);
        } catch (err) { /* skip failures, keep discovering */ }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    categoryLoadingEl.hidden = true;
  }

  function recordGenus(id, species) {
    if (state.genusById[id]) return;
    const genus = getEnglishGenus(species);
    if (!genus) return;
    state.genusById[id] = genus;
    addCategoryOption(genus);
    if (state.category && state.category === genus) scheduleFilterRefresh();
  }

  function addCategoryOption(genus) {
    const already = Array.from(categoryChipsEl.querySelectorAll('.chip')).some((c) => c.dataset.category === genus);
    if (already) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip category';
    btn.textContent = genus;
    btn.dataset.category = genus;
    btn.addEventListener('click', () => onCategoryChipClick(genus, btn));

    const chips = Array.from(categoryChipsEl.querySelectorAll('.chip'));
    let insertBefore = null;
    for (let i = 1; i < chips.length; i++) {
      if (chips[i].dataset.category.localeCompare(genus) > 0) { insertBefore = chips[i]; break; }
    }
    categoryChipsEl.insertBefore(btn, insertBefore);
  }

  function scheduleFilterRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      applyFilters();
    }, 400);
  }

  // ---------- Filtering & rendering ----------

  function applyFilters() {
    const q = state.search.trim().toLowerCase();
    let list = state.speciesList;

    if (q) {
      list = list.filter((p) => p.name.includes(q) || String(p.id) === q || String(p.id).padStart(4, '0').includes(q));
    }
    if (state.activeTypes.size) {
      list = list.filter((p) => {
        for (const t of state.activeTypes) {
          const set = state.typeNameSets[t];
          if (set && set.has(p.name)) return true;
        }
        return false;
      });
    }
    if (state.category) {
      list = list.filter((p) => state.genusById[p.id] === state.category);
    }

    state.filtered = list;
    state.renderedCount = 0;
    cardObserver.disconnect();
    grid.innerHTML = '';
    resultCountEl.textContent = list.length === state.speciesList.length
      ? `${list.length} Pokémon`
      : `${list.length} of ${state.speciesList.length} Pokémon`;

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">No Pokémon match your filters.</div>';
      return;
    }
    renderNextBatch();
  }

  function renderNextBatch() {
    const { filtered, renderedCount, batchSize } = state;
    if (renderedCount >= filtered.length) return;
    const next = filtered.slice(renderedCount, renderedCount + batchSize);
    const frag = document.createDocumentFragment();
    next.forEach((p) => {
      const card = createCardElement(p);
      frag.appendChild(card);
      cardObserver.observe(card);
    });
    grid.appendChild(frag);
    state.renderedCount += next.length;
  }

  function createCardElement(p) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'poke-card';
    el.dataset.id = p.id;
    el.setAttribute('aria-haspopup', 'dialog');
    el.innerHTML = `
      <span class="dex-num">#${String(p.id).padStart(4, '0')}</span>
      <span class="sprite-wrap"><img src="${PokeAPI.spriteUrl(p.id)}" alt="" loading="lazy" width="96" height="96"></span>
      <span class="name">${displayName(p.name)}</span>
      <span class="type-badges" data-role="types"></span>
    `;
    const img = el.querySelector('img');
    img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('span'), { className: 'sprite-placeholder' }));
    }, { once: true });
    el.addEventListener('click', () => openModal(p.id));
    return el;
  }

  async function loadCardDetail(id, el) {
    try {
      const [pokemon, species] = await Promise.all([PokeAPI.getPokemon(id), PokeAPI.getSpecies(id)]);
      const types = pokemon.types.slice().sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
      const badgesEl = el.querySelector('[data-role="types"]');
      if (badgesEl) badgesEl.innerHTML = typeBadgesHTML(types);
      recordGenus(id, species);
    } catch (err) { /* leave badges blank; grid stays usable */ }
  }

  // ---------- Modal ----------

  function bindModal() {
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
    });
  }

  function closeModal() {
    modalOverlay.hidden = true;
    document.body.style.overflow = '';
    modalBody.innerHTML = '';
  }

  async function openModal(id) {
    modalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    modalBody.innerHTML = '<div class="modal-loading">Loading…</div>';

    let pokemon, species;
    try {
      [pokemon, species] = await Promise.all([PokeAPI.getPokemon(id), PokeAPI.getSpecies(id)]);
    } catch (err) {
      modalBody.innerHTML = '<div class="error-banner">Couldn\'t load this Pokémon. Please try again.</div>';
      return;
    }

    recordGenus(id, species);

    const types = pokemon.types.slice().sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
    const flavor = getEnglishFlavorText(species);
    const genus = getEnglishGenus(species);

    modalBody.innerHTML = `
      <div class="detail-header">
        <span class="sprite-wrap"><img src="${PokeAPI.spriteUrl(id)}" alt=""></span>
        <div class="detail-title">
          <div class="dex-num">#${String(id).padStart(4, '0')}</div>
          <h2 id="modal-name">${displayName(pokemon.name)}</h2>
          <div class="genus">${genus || ''}</div>
          <div class="type-badges">${typeBadgesHTML(types)}</div>
        </div>
      </div>

      <div class="section-title">About</div>
      <p class="flavor-text">${flavor || 'No description available.'}</p>

      <div class="section-title">Base Stats</div>
      <div class="stats-block">${renderStats(pokemon.stats)}</div>

      <div class="section-title">Evolution</div>
      <div id="evo-container"><div class="modal-loading">Loading evolution chain…</div></div>

      <div class="section-title">Moves</div>
      <button type="button" class="moves-toggle" id="moves-toggle" aria-expanded="false">
        <span>${pokemon.moves.length} moves learned</span><span aria-hidden="true">&#9662;</span>
      </button>
      <div class="moves-list" id="moves-list" hidden>${buildMovesHTML(pokemon.moves)}</div>
    `;

    document.getElementById('moves-toggle').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const list = document.getElementById('moves-list');
      const willShow = list.hidden;
      list.hidden = !willShow;
      btn.setAttribute('aria-expanded', String(willShow));
    });

    if (species.evolution_chain && species.evolution_chain.url) {
      try {
        const chainData = await PokeAPI.getEvolutionChain(species.evolution_chain.url);
        const levels = flattenChain(chainData.chain);
        const evoContainer = document.getElementById('evo-container');
        if (evoContainer) evoContainer.innerHTML = renderEvolution(levels, id);
      } catch (err) {
        const evoContainer = document.getElementById('evo-container');
        if (evoContainer) evoContainer.innerHTML = '<p class="flavor-text">Evolution data unavailable.</p>';
      }
    }
  }

  // ---------- Rendering helpers ----------

  function displayName(name) {
    return name.replace(/-/g, ' ');
  }

  function typeBadgesHTML(types) {
    return types.map((t) => `<span class="type-badge" style="background:${typeColor(t)}">${t}</span>`).join('');
  }

  function renderStats(stats) {
    const labels = { 'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def' };
    return stats.map((s) => {
      const label = labels[s.stat.name] || s.stat.name;
      const pct = Math.max(4, Math.min(100, Math.round((s.base_stat / 200) * 100)));
      return `
        <div class="stat-row">
          <span class="stat-name">${label}</span>
          <span class="stat-track"><span class="stat-fill" style="width:${pct}%"></span></span>
          <span class="stat-value">${s.base_stat}</span>
        </div>`;
    }).join('');
  }

  function buildMovesHTML(movesRaw) {
    const groups = { 'level-up': [], egg: [], machine: [], tutor: [] };
    movesRaw.forEach((m) => {
      const details = m.version_group_details;
      if (!details || !details.length) return;
      const detail = details[details.length - 1];
      const method = detail.move_learn_method.name;
      if (!groups[method]) groups[method] = [];
      groups[method].push({ name: m.move.name, level: detail.level_learned_at });
    });

    if (groups['level-up']) groups['level-up'].sort((a, b) => a.level - b.level);
    Object.keys(groups).forEach((key) => {
      if (key !== 'level-up') groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    const labels = { 'level-up': 'Level Up', egg: 'Egg Moves', machine: 'TM / HM', tutor: 'Tutor' };
    let html = '';
    Object.keys(labels).forEach((method) => {
      const list = groups[method];
      if (!list || !list.length) return;
      html += `<div class="move-group-label">${labels[method]} (${list.length})</div>`;
      html += list.map((mv) => `<div class="move-item">${displayName(mv.name)}${method === 'level-up' && mv.level ? ` <span class="move-level">Lv. ${mv.level}</span>` : ''}</div>`).join('');
    });
    return html || '<div class="move-item">No moves on record.</div>';
  }

  function flattenChain(chainRoot) {
    const levels = [];
    let currentLevel = [chainRoot];
    while (currentLevel.length) {
      levels.push(currentLevel.map((n) => ({
        name: n.species.name,
        id: Number(n.species.url.split('/').filter(Boolean).pop()),
      })));
      currentLevel = currentLevel.flatMap((n) => n.evolves_to);
    }
    return levels;
  }

  function renderEvolution(levels, currentId) {
    let html = '<div class="evo-chain">';
    levels.forEach((level, i) => {
      if (i > 0) html += '<span class="evo-arrow" aria-hidden="true">&#8594;</span>';
      html += '<div class="evo-level-group">' + level.map((p) => `
        <div class="evo-stage ${p.id === currentId ? 'current' : ''}">
          <img src="${PokeAPI.spriteUrl(p.id)}" alt="" loading="lazy" width="64" height="64">
          <span class="evo-name">${displayName(p.name)}</span>
        </div>`).join('') + '</div>';
    });
    html += '</div>';
    return html;
  }

  function getEnglishGenus(species) {
    const entry = (species.genera || []).find((g) => g.language.name === 'en');
    return entry ? entry.genus : '';
  }

  function getEnglishFlavorText(species) {
    const entry = (species.flavor_text_entries || []).find((f) => f.language.name === 'en');
    if (!entry) return '';
    return entry.flavor_text.replace(/[\f\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  }
})();
