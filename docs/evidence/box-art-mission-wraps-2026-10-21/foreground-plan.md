# Quick independent foreground extraction plan

Inspected all four original JPGs. All rectangles below are `[x,y,width,height]` in original image pixels, top-left origin. Text regions are safety envelopes for local cream-ink masks, not opaque background panels. Keep original glyphs, proportions, distress, screenshots and logos. Avoid a global color key that would also select pale stone. Photos/badges may be composited opaquely with narrow clean borders; do not trim circular symbols or registered marks.

```json
{
  "hipnotic": {
    "front": {
      "size": [759,900],
      "text": {
        "quakeMissionHeader": [42,35,671,205],
        "scourgeTitle": [232,430,436,134],
        "requirement": [200,841,390,28]
      },
      "badges": {
        "id": [10,785,70,82],
        "rating": [92,794,94,70],
        "medallion": [588,742,131,135]
      }
    },
    "back": {
      "size": [761,900],
      "screenshots": [[457,202,249,160],[54,340,251,161],[458,481,247,160],[55,622,250,160]],
      "text": [[72,20,630,38],[24,65,710,128],[25,240,404,76],[345,372,394,99],[25,513,414,100],[346,660,389,80]],
      "footerBadgesWithLabels": {
        "idPublished": [38,787,79,92],
        "activisionDistributed": [565,810,156,65]
      }
    }
  },
  "rogue": {
    "front": {
      "size": [761,900],
      "text": {
        "quakeMissionHeader": [40,40,674,200],
        "dissolutionTitle": [77,753,512,56],
        "requirement": [211,840,392,29]
      },
      "badges": {
        "id": [20,795,64,72],
        "rating": [95,795,94,70],
        "medallion": [605,750,128,129]
      }
    },
    "back": {
      "size": [763,900],
      "screenshots": [[449,174,208,147],[92,290,212,148],[449,406,208,148],[92,530,213,149]],
      "text": [[38,46,688,102],[58,208,383,77],[314,335,412,59],[58,449,385,75],[317,568,400,74],[42,708,683,77]],
      "footerBadgesWithLabels": {
        "idPublished": [43,787,76,92],
        "activisionDistributed": [319,809,145,66],
        "rogueDeveloped": [659,790,57,91]
      }
    }
  }
}
```

Transform every crop and its placement by the same proportional source-to-face transform from the recipe. Retain the resulting precise paste coordinates in composition evidence. Wrap order is back 1640 px, spine 340 px, front 1640 px at common height 2000 px. Derive the three shipped panels from the final assembled 3620x2000 wrap so background identity is shared across both folds.

The gold/black Hipnotic source architecture and Rogue reptile-eye hero are defining source artwork. The model should preserve those defining features while creating the continuous text-free background; retaining only title lettering would not by itself establish source-faithful covers. Review source/bare-background/composited-wrap side by side. Check all four screenshots per back, complete requirement lines, every footer label and registered mark, right mission number, original proportions and clear fold continuity.

This is a quick visual planning result, not pixel-verified segmentation. Crop envelopes include safety margins and require a complete-content look before compositing. No authoring, runtime mutation, provider call, build, test suite or board mutation was performed by this reviewer. Root owns implementation and acceptance.

Final owner-selected background geometry supersedes the earlier common-width planning default: Hipnotic wrap3620×2000, faces1640×2000; Rogue wrap3614×2000, faces1637×2000; both spines340×2000. Derive source placement from each image's native dimensions with uniform fit and vertical centering. The source rectangles above remain in their original native-pixel coordinates.
