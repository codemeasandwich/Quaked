# Stone and brick trim interpretation

This increment covers eight missing material identities from Dimension of the
Machine. It is still a candidate: registration, public renderer checks, GPU
review and Dev publication must name the exact accepted files.

## Owner correction to the brickwork

The original `br_trim1_1` and `br_trim1_2` contain solid plain side blocks around
darker patterned brick infill. The solid blocks project slightly and their
alternating inward extensions are filled masonry. They are not missing bricks,
black square cavities or a frame added around the texture. The patterned center
sits behind the plain blocks. Its material must stop cleanly at both interfaces;
glaze and blue mineral flecks must not bleed into the plain side blocks.

Earlier photographs were incorrectly approved with square recesses at the side
returns. Those approvals are superseded by the owner's correction. Later narrow
photographs also exposed an incomplete bottom course and material bleed on the
right. Keep those drafts and their failed reviews as history; do not install them.

The wide native texture is 128×64, with eight courses and alternating seven/six
complete patterned faces. The narrow native texture is 64×64, with the same
physical brick module and eight courses but alternating three/two faces. Scaling
the entire wide texture to half its width would distort the brick and side-block
sizes. Reusing photographed modules at their existing scale is permitted only
with an explicit crop/composition receipt and independent review.

## Existing engine path for the recessed center

`R_NewerTextureUpgrade` loads the source-key-specific ordinary replacement, its
height image and grayscale XYZ normal images. It reads scalar height from the
decoded height image's red channel and puts that same height into the normal
texture's alpha channel. `R_NormalMapFor` marks it as a height source.

The existing world-material shader uses alpha for parallax: a lower value places
a surface farther behind the reference plane. It currently uses a depth of 0.02
texture tiles and ten layers, fading the effect at distance. This is a visual
surface recess; it does not move the BSP wall, collision or silhouette. The
separate actual mesh-displacement route is not enabled for these brick textures.

The existing `authored_height(..., 'layered-veneer', layering)` policy in
`update_level_sheets.py` already separates material planes independently of
brightness. It bounds fine relief so a bright inset brick remains behind a dark
plain block. Reuse this policy with source-bound regions, rather than inferring
the recess from colour or adding another renderer path. The decoded quality-92
height must preserve the plane ordering with a measured margin.

## Acceptance

Every runtime image is exactly four times native width and height and lossy WebP
quality 92, including height and XYZ components. Compare original and replacement
at the same half-native dimensions and again at quarter-native dimensions. These
views need clear similarity, not pixel equality. Separately inspect sharp
photographic detail, complete brick courses, both material boundaries, repeated
edges and relief under opposite lights. Confirm the real loader supplies the
height in normal alpha and inspect an oblique GPU view before claiming the
center is visibly recessed in the engine.
