// Thin fetch/cache layer over PokéAPI. Keeps an in-memory Map (fast, this session)
// backed by sessionStorage (survives reopening the tab / re-render) and dedupes
// concurrent requests for the same resource via a shared in-flight promise map.

const API_BASE = 'https://pokeapi.co/api/v2';
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const NATIONAL_DEX_SIZE = 1025;

const memoryCache = new Map();
const inFlight = new Map();

function cacheGet(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const value = JSON.parse(raw);
      memoryCache.set(key, value);
      return value;
    }
  } catch (e) { /* sessionStorage unavailable or full — fall through */ }
  return undefined;
}

function cacheSet(key, value) {
  memoryCache.set(key, value);
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* quota exceeded — memory cache still holds it for this session */ }
}

async function fetchJSON(key, url) {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return res.json();
    })
    .then((data) => {
      cacheSet(key, data);
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

const PokeAPI = {
  spriteUrl(id) {
    return `${SPRITE_BASE}/${id}.png`;
  },

  // Lightweight master list: id + name only, one request.
  async getSpeciesList() {
    const data = await fetchJSON(
      'pokeapi:species-list',
      `${API_BASE}/pokemon-species?limit=${NATIONAL_DEX_SIZE}&offset=0`
    );
    return data.results.map((entry) => {
      const id = Number(entry.url.split('/').filter(Boolean).pop());
      return { id, name: entry.name };
    });
  },

  // Full pokemon record: stats, types, moves, sprites.
  getPokemon(id) {
    return fetchJSON(`pokeapi:pokemon:${id}`, `${API_BASE}/pokemon/${id}`);
  },

  // Synchronous cache read — returns the pokemon record if already fetched,
  // or undefined without triggering a network request.
  peekPokemon(id) {
    return cacheGet(`pokeapi:pokemon:${id}`);
  },

  // Species record: flavour text, genus, evolution chain link, legendary/mythical flags.
  getSpecies(id) {
    return fetchJSON(`pokeapi:species:${id}`, `${API_BASE}/pokemon-species/${id}`);
  },

  getEvolutionChain(url) {
    const id = url.split('/').filter(Boolean).pop();
    return fetchJSON(`pokeapi:evochain:${id}`, url);
  },

  // Bulk membership list for a type — used for the type filter chips so we
  // never have to fetch full detail for all 1025 Pokémon just to filter.
  async getPokemonNamesForType(type) {
    const data = await fetchJSON(`pokeapi:type:${type}`, `${API_BASE}/type/${type}`);
    return new Set(data.pokemon.map((entry) => entry.pokemon.name));
  },
};
