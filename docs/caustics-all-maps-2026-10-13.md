# Caustics on every map (13 October 2026)

The owner's trial found the improved water caustics missing. Most stock maps' water is
`*04water1` (E1M3 and ten others), and Episode 3's is the murky `*04mwat1/2`; both defaulted to
the Muddy look, whose opacity and sediment scatter hide most of the caustic light and whose own
caustic weight is 0.65. Asked whether to keep Muddy only for E1M3, the owner chose caustics on
**all maps**.

- `liquidMapLook` (`src/newer/render/r_post_liquids.js`) now gives every map's water its kind's
  own look (Clear), so its pools show caustics at full strength. The owner's E1M2 look (Tinted,
  from the owner's water work) stays. Slime keeps its Toxic look.
- Muddy, and every other look, stays a choice: Options, Newer features, Water appearance
  (`r_water_look`: 0 the map's look, 1 Clear, 2 Tinted, 3 Muddy, 4 Toxic).
- Test: `tests/r_post_liquids_test.js` (no water defaults to Muddy; E1M2 keeps Tinted).
- Not seen in a browser here: Newer Game stalls while loading in headless WebKit on this machine,
  with or without this change, so the look on screen awaits the owner's trial.
