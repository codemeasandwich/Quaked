# Weapon Models credit artwork

The owner supplied `dannaki-name.png` on 2026-10-02 to display **小林 団那紀 (dannaki)** below the in-game **Weapon Models** heading. The 2508×627 PNG is copied unchanged from the attached artwork. The weapon archives' existing author/license metadata is retained separately in `newer/weapons`.

The existing PNG loader applies display-only processing: pixels whose maximum RGB channel is at most 3 become transparent, transparent margins are trimmed, and the remaining image is scaled proportionally with nearest-neighbour sampling. The source contains near-black values of 1, so keying only exact black leaves an unwanted background. At 8 menu pixels high the image is 58 pixels wide, matching the standard text height. The original PNG is not rewritten, recoloured or regenerated.

Ordinary startup awaits this optional image and passes the loaded picture through `M_SetExternals`. A load, decode or processing failure preserves a visible ASCII `Dannaki (dannaki)` fallback. Only the supplied image is used for the native-script name because Quake's original charset has no Japanese glyphs.
