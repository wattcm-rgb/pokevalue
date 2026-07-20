# Pokédex Catalogue

A complete, lazy-loading Pokédex covering all ~1025 Pokémon, built with plain HTML/CSS/JS and live data from [PokéAPI](https://pokeapi.co/).

Live: https://wattcm-rgb.github.io/pokevalue/

## Features

- Catalogue grid of every national-dex Pokémon, rendered in batches with infinite scroll
- Full detail (types, stats) fetched lazily only as cards scroll into view or are opened, keeping the initial load light
- Search by name or dex number
- Filter by type (18 type-colour chips) using PokéAPI's bulk `/type/{name}` endpoint
- Filter by category (genus), populated progressively as the dex is browsed
- Detail modal: HP & base stats, types, collapsible/grouped move list, evolution chain, flavour text
- In-memory + `sessionStorage` caching so reopening a Pokémon or filter is instant

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
