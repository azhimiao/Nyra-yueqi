# Third-Party Notices — Games (mechanism references)

Nyra Games Launch v1 implements **original** duo/group engines inspired by well-known social/party game *mechanisms*. This is **not** an official product of any of the referenced projects or commercial board games.

## Mechanism-reference repositories

These repos were consulted as **mechanism references** only (rules patterns, UX ideas, open implementations). Nyra does **not** ship their assets, official logos, or card art.

| Reference | Role (mechanism only) |
|-----------|------------------------|
| [Hamatti/taajuus](https://github.com/Hamatti/taajuus) | Spectrum / frequency-style play ideas |
| [paullessing/codenames](https://github.com/paullessing/codenames) | Grid clue / team word association patterns |
| [cjquines/just-one](https://github.com/cjquines/just-one) | Parallel single-word clue + guess flow |
| [Akwd22/the-mind](https://github.com/Akwd22/the-mind) | Cooperative ascending-number coordination |
| [TylerYep/wolfbot](https://github.com/TylerYep/wolfbot) | Social-deduction / werewolf bot research patterns |
| [KylJin/Werewolf](https://github.com/KylJin/Werewolf) | Werewolf / night-role sequencing references |

## License & copying policy

- **Check each repository’s LICENSE** before copying any code, text, or assets.  
- Prefer clean-room reimplementation of *mechanisms*; do not vendor or paste proprietary card text, logos, or trademarks.  
- Commercial board-game brands (e.g. Just One, Codenames, The Mind, One Night Werewolf) remain their owners’ property; Nyra titles are original Chinese product names with mechanism-aligned descriptions only.

## In-repo games code

Primary implementation lives under `src/games/` (duo, group, platform, simulate, adapters). Content word banks are project-authored lists, not scraped official decks.

---

# Built-in music (Wikimedia Commons / Musopen)

Nyra ships **catalog metadata only** (title, artist, remote URL, license pointer). Audio bytes are **not** bundled; the client downloads on first play into local IndexedDB media.

| Track | Source | License (as marked on Commons) | File page |
|-------|--------|--------------------------------|-----------|
| Erik Satie — Gymnopédie No.1 | Wikimedia Commons | CC0 1.0 | [File](https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg) |
| Chopin — Nocturne Op.9 No.2 | Wikimedia Commons / Musopen | CC0 1.0 | [File](https://commons.wikimedia.org/wiki/File:Chopin_Nocturne_No._2_in_E_Flat_Major,_Op._9.ogg) |
| Bach — Cello Suite No.1 Prelude BWV 1007 | Wikimedia Commons | CC0 1.0 | [File](https://commons.wikimedia.org/wiki/File:Bach_Cello_Suite_1_Prelude_(BWV_1007)_Played_by_Chris.ogg) |
| Beethoven — Moonlight Sonata I | Wikimedia Commons / Musopen | Public Domain | [File](https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_'moonlight',_op._27_no._2_-_i._adagio_sostenuto.ogg) |

Direct download URLs are stored in `src/library/builtin-catalog.js` (`BUILTIN_TRACKS`).

## Built-in book

| Work | Path | Notes |
|------|------|-------|
| 《那里怎么样》 Nyra Original 001 | `public/content/books/nyra-original-001.epub` | First-party Nyra short story; bundled EPUB imported into local library on first open |
