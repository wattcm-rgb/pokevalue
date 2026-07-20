(function () {
  const COLLECTION_KEY = 'pokevalue:collection';
  const VARIANTS = ['Normal', 'Holo', 'Reverse Holo', '1st Edition', 'Full Art', 'Promo'];

  const state = {
    speciesList: [],
    speciesById: new Map(),
    filtered: [],
    renderedCount: 0,
    batchSize: 40,
    search: '',
    activeTypes: new Set(),
    typeNameSets: {},
    collection: {},
    activeTab: 'catalogue',
  };

  const grid = document.getElementById('catalogue-grid');
  const myCardsGrid = document.getElementById('my-cards-grid');
  const catalogueView = document.getElementById('catalogue-view');
  const myCardsView = document.getElementById('my-cards-view');
  const statusEl = document.getElementById('grid-status');
  const resultCountEl = document.getElementById('result-count');
  const sentinel = document.getElementById('sentinel');
  const searchInput = document.getElementById('search-input');
  const typeChipsEl = document.getElementById('type-chips');

  const modalOverlay = document.getElementById('modal-overlay');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');

  let cardObserver;
  let scrollObserver;
  let searchTimer = null;

  init();

  async function init() {
    state.collection = loadCollection();
    buildTypeChips();
    setupObservers();
    bindControls();
    bindModal();
    bindTabs();

    statusEl.textContent = 'Loading Pokédex…';
    try {
      state.speciesList = await PokeAPI.getSpeciesList();
    } catch (err) {
      statusEl.textContent = '';
      grid.innerHTML = '<div class="error-banner">Couldn\'t reach PokéAPI. Check your connection and reload the page.</div>';
      return;
    }
    state.speciesById = new Map(state.speciesList.map((p) => [p.id, p]));
    statusEl.textContent = '';
    applyFilters();
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

  // ---------- Tabs ----------

  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    catalogueView.hidden = tab !== 'catalogue';
    myCardsView.hidden = tab !== 'my-cards';
    refreshActiveView();
  }

  function refreshActiveView() {
    if (state.activeTab === 'my-cards') renderMyCards();
    else applyFilters();
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
      refreshActiveView();
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
    refreshActiveView();
  }

  function bindControls() {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = searchInput.value;
        refreshActiveView();
      }, 200);
    });
  }

  // ---------- Collection (owned cards) ----------

  function loadCollection() {
    try {
      return JSON.parse(localStorage.getItem(COLLECTION_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function saveCollection() {
    try {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(state.collection));
    } catch (err) { /* storage unavailable — collection stays in-memory only */ }
  }

  function toggleOwned(id, owned) {
    const current = state.collection[id];
    if (owned) {
      state.collection[id] = { qty: (current && current.qty) || 1, variant: (current && current.variant) || VARIANTS[0] };
      ensureTypesLoaded(id).then(() => { if (state.activeTab === 'my-cards') renderMyCards(); });
    } else {
      state.collection[id] = { qty: 0, variant: (current && current.variant) || VARIANTS[0] };
    }
    saveCollection();
    syncCollectionUI(id);
  }

  function adjustQuantity(id, delta) {
    const current = state.collection[id] || { qty: 0, variant: VARIANTS[0] };
    const nextQty = Math.max(0, Math.min(99, current.qty + delta));
    state.collection[id] = { ...current, qty: nextQty };
    saveCollection();
    syncCollectionUI(id);
    return nextQty;
  }

  function setVariant(id, variant) {
    const current = state.collection[id] || { qty: 0 };
    state.collection[id] = { ...current, variant };
    saveCollection();
    syncCollectionUI(id);
  }

  function syncCollectionUI(id) {
    document.querySelectorAll(`.poke-card[data-id="${id}"]`).forEach((el) => applyCollectionToCard(el, id));
    if (state.activeTab === 'my-cards') renderMyCards();
  }

  function applyCollectionToCard(el, id) {
    const entry = state.collection[id];
    const owned = !!(entry && entry.qty > 0);
    const checkbox = el.querySelector('[data-role="owned-checkbox"]');
    const qtyBadge = el.querySelector('[data-role="qty-badge"]');
    const variantTag = el.querySelector('[data-role="variant-tag"]');
    if (checkbox) checkbox.checked = owned;
    if (qtyBadge) {
      qtyBadge.hidden = !owned;
      qtyBadge.textContent = owned ? `×${entry.qty}` : '';
    }
    if (variantTag) {
      variantTag.hidden = !owned;
      variantTag.textContent = owned ? entry.variant : '';
    }
  }

  async function ensureTypesLoaded(id) {
    try { await PokeAPI.getPokemon(id); } catch (err) { /* ignore, badges just stay blank */ }
  }

  function typesFor(id) {
    const cached = PokeAPI.peekPokemon(id);
    if (!cached) return null;
    return cached.types.slice().sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  }

  // ---------- Catalogue filtering & rendering ----------

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
    const el = document.createElement('div');
    el.className = 'poke-card';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-haspopup', 'dialog');
    el.dataset.id = p.id;
    el.innerHTML = `
      <div class="card-top-row">
        <label class="owned-toggle" aria-label="Mark as owned">
          <input type="checkbox" data-role="owned-checkbox">
          <span class="owned-box" aria-hidden="true"></span>
        </label>
        <span class="dex-num">#${String(p.id).padStart(4, '0')}</span>
      </div>
      <span class="sprite-wrap"><img src="${PokeAPI.spriteUrl(p.id)}" alt="" loading="lazy" width="68" height="68"></span>
      <span class="name">${displayName(p.name)}</span>
      <span class="type-badges" data-role="types"></span>
      <span class="qty-badge" data-role="qty-badge" hidden></span>
      <span class="variant-tag" data-role="variant-tag" hidden></span>
    `;
    const img = el.querySelector('img');
    img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('span'), { className: 'sprite-placeholder' }));
    }, { once: true });

    const checkbox = el.querySelector('[data-role="owned-checkbox"]');
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => toggleOwned(p.id, checkbox.checked));

    el.addEventListener('click', (e) => {
      if (e.target.closest('.owned-toggle')) return;
      openModal(p.id);
    });
    el.addEventListener('keydown', (e) => {
      if (e.target.closest('.owned-toggle')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(p.id);
      }
    });

    const cachedTypes = typesFor(p.id);
    if (cachedTypes) el.querySelector('[data-role="types"]').innerHTML = typeBadgesHTML(cachedTypes);
    applyCollectionToCard(el, p.id);
    return el;
  }

  async function loadCardDetail(id, el) {
    try {
      const pokemon = await PokeAPI.getPokemon(id);
      const types = pokemon.types.slice().sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
      const badgesEl = el.querySelector('[data-role="types"]');
      if (badgesEl) badgesEl.innerHTML = typeBadgesHTML(types);
    } catch (err) { /* leave badges blank; grid stays usable */ }
  }

  // ---------- My Cards ----------

  function renderMyCards() {
    let ids = Object.keys(state.collection)
      .map(Number)
      .filter((id) => state.collection[id] && state.collection[id].qty > 0);

    const q = state.search.trim().toLowerCase();
    if (q) {
      ids = ids.filter((id) => {
        const species = state.speciesById.get(id);
        return species && (species.name.includes(q) || String(id) === q || String(id).padStart(4, '0').includes(q));
      });
    }
    if (state.activeTypes.size) {
      ids = ids.filter((id) => {
        const types = typesFor(id) || [];
        for (const t of state.activeTypes) if (types.includes(t)) return true;
        return false;
      });
    }

    ids.sort((a, b) => {
      const qtyDiff = state.collection[b].qty - state.collection[a].qty;
      if (qtyDiff !== 0) return qtyDiff;
      const typeA = (typesFor(a) || [])[0] || '';
      const typeB = (typesFor(b) || [])[0] || '';
      return typeA.localeCompare(typeB);
    });

    myCardsGrid.innerHTML = '';
    const totalCopies = ids.reduce((sum, id) => sum + state.collection[id].qty, 0);
    resultCountEl.textContent = ids.length ? `${ids.length} Pokémon · ${totalCopies} cards` : '';

    if (!ids.length) {
      myCardsGrid.innerHTML = '<div class="empty-state">No cards yet — tap the checkbox on a Pokémon in the Catalogue tab to add it here.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    ids.forEach((id) => {
      const species = state.speciesById.get(id);
      if (!species) return;
      const card = createCardElement(species);
      if (!typesFor(id)) {
        ensureTypesLoaded(id).then(() => { if (state.activeTab === 'my-cards') renderMyCards(); });
      }
      frag.appendChild(card);
    });
    myCardsGrid.appendChild(frag);
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

    const types = pokemon.types.slice().sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
    const flavor = getEnglishFlavorText(species);
    const genus = getEnglishGenus(species);
    const entry = state.collection[id] || { qty: 0, variant: VARIANTS[0] };

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

      <div class="section-title">Leo's Collection</div>
      <div class="collection-box">
        <label class="collection-owned">
          <input type="checkbox" id="collection-owned">
          <span>Owned</span>
        </label>
        <div class="qty-stepper">
          <button type="button" id="qty-minus" aria-label="Decrease quantity">−</button>
          <span id="qty-value">${entry.qty}</span>
          <button type="button" id="qty-plus" aria-label="Increase quantity">+</button>
        </div>
        <select id="variant-select" aria-label="Card variant">
          ${VARIANTS.map((v) => `<option value="${v}">${v}</option>`).join('')}
        </select>
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

    const ownedCb = document.getElementById('collection-owned');
    const qtyValueEl = document.getElementById('qty-value');
    const variantSelect = document.getElementById('variant-select');
    ownedCb.checked = entry.qty > 0;
    variantSelect.value = entry.variant || VARIANTS[0];

    ownedCb.addEventListener('change', () => {
      toggleOwned(id, ownedCb.checked);
      qtyValueEl.textContent = state.collection[id].qty;
    });
    document.getElementById('qty-minus').addEventListener('click', () => {
      const nextQty = adjustQuantity(id, -1);
      qtyValueEl.textContent = nextQty;
      ownedCb.checked = nextQty > 0;
    });
    document.getElementById('qty-plus').addEventListener('click', () => {
      const nextQty = adjustQuantity(id, 1);
      qtyValueEl.textContent = nextQty;
      ownedCb.checked = nextQty > 0;
    });
    variantSelect.addEventListener('change', () => setVariant(id, variantSelect.value));

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
          <span class="stat-track"><span class="stat-fill" style="width:${pct}%; background:${statColor(pct)}"></span></span>
          <span class="stat-value">${s.base_stat}</span>
        </div>`;
    }).join('');
  }

  // Red (weak) through yellow to green (strong), scaled to the same /200 basis as the bar width.
  function statColor(pct) {
    const hue = Math.round((pct / 100) * 120);
    return `linear-gradient(90deg, hsl(${hue}, 75%, 55%), hsl(${hue}, 75%, 42%))`;
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
