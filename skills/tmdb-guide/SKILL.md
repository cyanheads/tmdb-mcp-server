---
name: tmdb-guide
description: Resolve movie, TV, and person identities with tmdb_* tools, build regional watchlists, verify directing credits, and follow show seasons or complete filmographies. Use for multi-step TMDB research where discovery filters alone cannot establish the requested credit or availability.
license: Apache-2.0
metadata:
  author: "cyanheads"
  version: "1.0"
---

## Scope

TMDB supplies movie, TV, and person metadata and JustWatch-backed regional provider listings. It does not play media, manage accounts, or expose an episode-detail tool. The server requires a TMDB API Read Access Token.

## Identifiers

Keep each integer `id` with its `media_type`. tmdb_search_titles and tmdb_get_trending can return movies, TV shows, or people; tmdb_discover_titles, recommendations, and filmography entries identify titles. Cast/crew `id` values identify people for tmdb_get_person. IMDb and other external IDs are cross-references, not TMDB lookup IDs.

For discovery genre IDs, inspect `genres[].id` from tmdb_get_movie or tmdb_get_show; summary results expose genre names without their IDs. Movie and TV genre vocabularies differ. TV network IDs come from tmdb_get_show `networks[].id`; provider IDs come from tmdb_get_watch_providers `provider_id` records within its availability categories. Networks and watch providers are different identifiers even when their names match.

## Gates

- Resolve ambiguous titles or people using the returned year, entity kind, overview, and known-for titles before fetching detail. Search ranking alone does not establish identity; the search year filter only applies in movie or TV mode.
- Before claiming a title is included with a subscription, check its regional `flatrate` list. Rental, purchase, ad-supported, and free listings are separate categories. Provider-filtered discovery alone does not prove subscription inclusion. Report an empty listing as no TMDB provider data for that region, rather than proof that no legal viewing option exists.
- Before claiming a person directed a title, inspect the person's crew credit `job`. Discovery's crew filter matches crew membership, not a particular job; movie detail's key crew is curated and cast is capped, so absence there is not a complete filmography check.
- Read notices before presenting filtered discovery as satisfying every criterion: TV ignores cast/crew filters and revenue sorting; movies ignore network filters. Multiple people, networks, or providers match any listed ID, while required genres match all listed IDs.
- Follow tmdb_get_person `next_credits_page` until it is absent before calling the filmography complete. Cast and crew lists page independently; an empty cast page does not establish that crew credits are exhausted. The person resource returns only the first page; continue through the tool.

## Core chain

Resolve the entity with tmdb_search_titles, inspect the matching detail with tmdb_get_movie, tmdb_get_show, or tmdb_get_person, then branch into providers, credits, or seasons. Already-resolved IDs from other results can go straight to the matching detail tool.

## Workflows

**A regional watchlist:** Resolve a known title and call tmdb_get_watch_providers in the user's country to obtain provider IDs. Use those IDs with tmdb_discover_titles to browse candidates, then check each shortlisted title with tmdb_get_watch_providers in the same country and verify the requested category. Use the returned TMDB/JustWatch link for viewing destinations rather than constructing provider deep links.

**A director's work:** Resolve the person, fetch tmdb_get_person, and follow its continuation while preserving the chosen language. Select crew credits whose job is Director, retain the title's media type, and fetch the matching movie/show detail for the user's additional criteria. For TV participation, use the person's credits rather than discovery's movie-only crew filter.

**A show's episodes:** Resolve the TV series and fetch tmdb_get_show. Select actual returned season numbers for tmdb_get_season; season zero is Specials and must not be inferred from the regular-season count. The season tool returns episodes and guest stars, while show-level detail supplies last/next episode summaries.

**Ranked browsing:** Use discovery for explicit criteria and trending for day/week popularity. Set an explicit latest date when excluding future releases and combine rating order with a vote-count floor chosen for the task. Page search/discovery/trending results within the tools' supported range; the first page is not the full result set. Response language controls presentation; original-language filtering controls the works selected.
