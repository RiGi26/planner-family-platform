# OpenJLPT

Source of `src/data/vocab_n5.json`, `src/data/kanji_n5.json`, and 20 of the 49
entries in `src/data/grammar_n5.json` (each entry is tagged `data.source`).

- Repository: https://github.com/evanclan/OpenJLPT
- License: Creative Commons Attribution-ShareAlike 4.0 International (see LICENSE)
- OpenJLPT itself compiles from JMdict, KANJIDIC2, the Jonathan Waller JLPT lists
  (tanos.co.uk, CC BY) and Tatoeba (CC BY)

What was changed: entries were reshaped into this app's generic item form
(content-derived ids, `data` sub-object, at most two example sentences kept per
item; kana-only words read as themselves). The derived datasets remain under
CC BY-SA 4.0.

The remaining 29 grammar entries (`data.source: "compiled"`) were written for this
app and are not part of OpenJLPT.
