# Leo's Pokémon Catalogue

A lazy-loading Pokédex covering all ~1025 Pokémon plus a personal card-collection tracker, built with plain HTML/CSS/JS and live data from [PokéAPI](https://pokeapi.co/).

Live: https://wattcm-rgb.github.io/pokevalue/

## Features

- **Catalogue tab**: every national-dex Pokémon, rendered in batches with infinite scroll; full detail (types, stats) fetched lazily only as cards scroll into view or are opened
- Search by name or dex number; filter by type (18 type-colour chips) using PokéAPI's bulk `/type/{name}` endpoint
- Mark any Pokémon as owned right from its card, set how many copies, and pick a variant (Normal, Holo, Reverse Holo, 1st Edition, Full Art, Promo)
- **My Cards tab**: everything marked owned, sorted by quantity then type, with the same type filter available
- Collection is saved to `localStorage`, so it persists across visits
- Detail modal: HP & base stats, types, collapsible/grouped move list, evolution chain, flavour text
- In-memory + `sessionStorage` caching of PokéAPI responses so reopening a Pokémon or filter is instant

## Structure

```
index.html
css/style.css
js/types.js   – type colour reference
js/api.js     – PokéAPI fetch + cache layer
js/app.js     – rendering, filters, modal
```

No build step — it's a static site. Serve `index.html` with any static file server, or open it directly.

## Deployment

Static files at the repo root — deployed to GitHub Pages by pointing Settings → Pages → Source at the `main` branch (root folder). No build step or Actions workflow required.
