# Remote-race base adaptation

Verdict: **PASS for the exact new base and unchanged controls.** Use the new [reviewed-bootstrap-race1.json](reviewed-bootstrap-race1.json), with detailed proof in [base-adaptation-race1-review.json](base-adaptation-race1-review.json). The original bootstrap remains unchanged and valid only for its recorded base.

The first actual commit `efd8e30f08280348f5070d95bc42889ebf833cbe` retains parents `ed603b16...` and `de49ef8f...`. Its real 17-command normal-hook receipt passes and binds tree `09078d08e84db0d6df812c985d99cf6422688d51`; that historical PASS is preserved. Root reported its ordinary non-force push was rejected after the other agent published box-art commit `ae03a8b23a74fdf598e41aa824ca4ac81a6f4c95`.

The new isolated clone has actual HEAD `ae03a8b23a74fdf598e41aa824ca4ac81a6f4c95`, MERGE_HEAD `efd8e30f08280348f5070d95bc42889ebf833cbe`, and no unresolved index entries. All three actual staged controls match the frozen hashes and the first qualified commit. The Quake catalogue remains a regular staged addition with SHA-256 `9356d6637b0fcec5b87b5d74a6746ec909d44430d1f034b9c33edbab7786f447`.

The existing immutable-history observer independently rechecked the **new** base: complete 1,107-commit nonshallow history, fixed anchor `260a3cc5551ed8a8d5b76b03d64a3253813fe420` reachable, catalogue absent at the base and never present in its history. Graph SHA-256 is `062d7bcd5babda99e60a7f6ea561f88ef6c04d4c0babe07d5e1e409a3209045f`. The new bootstrap binds that base and exact catalogue/control bytes, with the same main/fc24 reference roots.

The box-art commit changes 55 paths. Comparing the actual new staged index against `ae03a8b2...` gives **no differences at any of those paths**. The predicted merge tree `10a55ceb4105a3ce89e30501f1f5e9222cb22193` also preserves them exactly. This proves preservation of the other agent's entries; it does not independently qualify that artwork or certify an uncreated merge commit.

No control implementation changed, so the exact named scope-case result and prior normal-gate control evidence carry forward by hash. The normal 17-command texture/HTML gate must nevertheless run again against the final new base/tree, including the new box-art inputs. Root must retain that new receipt, create and verify the merge with both parents, publish without forcing after a fresh remote check, and verify protected bytes when synchronizing Dev into fc24. This review makes no new-gate, publication, synchronization or release claim.
