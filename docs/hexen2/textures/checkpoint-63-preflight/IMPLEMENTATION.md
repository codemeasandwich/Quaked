# Approved Dev texture and HTML checkpoint gate

The coordinator approved the independent plan after the owner explicitly requested texture and HTML checks for Dev and prohibited a full build in this campaign. The implementation changes the existing `tools/distribution/precommit.mjs`, its staged contract fixtures, and adds `tools/texture_sheets/check_texture_catalog_custody.py`. No workflow, CI, release or pre-push guard was changed. [implementation-tests.json](implementation-tests.json) records focused verification and exact source hashes. The original catalog preflight result is an earlier observation, before this authorized gate implementation.

The default hook now requires Dev and a wholly admitted texture scope. It classifies a fixed HEAD/tree diff, including deletion and rename endpoints; changed symlinks, submodules and an unmerged index are rejected. Unknown/mixed scope reports offending paths before commands run. The pinned tree is exported through a private temporary index. A later HEAD/index change prevents receipt publication. Normal execution also requires the executing precommit file to equal its staged bytes.

Root review identified that the inherited `dist/staged` publication could delete another agent's desktop or pack outputs. The required correction gives Dev texture output its own **`dist/texture-checkpoints/<pinned-tree>/`** directory. It exclusively creates that destination and refuses any existing directory, file or symlink; it never removes or reuses it. Only this gate's `web/` HTML/data and `staged-receipt.json` are copied there, with the receipt last. Redirected parent directories are rejected. `dist/staged` and foreign outputs remain untouched. A failed copy leaves its newly reserved partial directory and failed snapshot for diagnosis, never a successful terminal claim. Full-mode publication remains unchanged outside this campaign. Failed setup/export before checks removes only its private snapshot/index; unsupported scope creates none.

The texture path runs seven existing Python texture suites, snapshot catalog custody, dependency bootstrap, existing distribution contracts, the existing web build, and `verify-site.mjs`. It sets `PYTHONDONTWRITEBYTECODE=1` and strips inherited Git and tool-selecting `QUAKED_*` overrides. The historical opt-in actual-asset tests in the ordinary/layered suites remain optional; the separate current source/receipt/map custody check is required. None of these steps runs desktop, Cargo, LAN engine or Tauri builds. The final receipt identifies base/tree, actual successful commands, HTML SHA256 and `macBuilt:false`; native/release/remote CI qualification remains explicit.

The custody checker reads only snapshot repository files. It remaps the explicitly supplied canonical source-root prefix into that snapshot without changing metadata bytes. It rejects missing or changed snapshot inputs even if corresponding live working files exist. Previously sealed external native/provider witnesses are listed as historical references and are not reread; this is not a new native/provider audit. New/changed catalog rows require sealed PASS actual, preview, ART and final-custody receipts binding every current package/map digest. The check also verifies active Low/master inputs, codec declarations, physical/binding counts and campaign/progress/queue agreement. It does not generate images, accept art or rerun actual producer math.

## One-time reviewed bootstrap

Gate-control paths are never part of the ordinary texture allowlist. This initial change needs a separate attributable independent review receipt. The only bootstrap-eligible control paths are exactly:

- `tools/distribution/precommit.mjs`
- `tests/staged_contract_test.mjs`
- `tools/texture_sheets/check_texture_catalog_custody.py`

The coordinator/reviewer creates the receipt **after reviewing the final exact staged blobs**, outside the staged scope. Its JSON shape is:

```json
{
  "schemaVersion": 1,
  "baseCommit": "FULL_CURRENT_HEAD_COMMIT",
  "reviewedBy": "Actual independent reviewer identity",
  "authority": "Owner authorized texture and HTML Dev checks; full builds prohibited for this campaign",
  "controls": {
    "tools/distribution/precommit.mjs": "SHA256_OF_EXACT_STAGED_BYTES",
    "tests/staged_contract_test.mjs": "SHA256_OF_EXACT_STAGED_BYTES",
    "tools/texture_sheets/check_texture_catalog_custody.py": "SHA256_OF_EXACT_STAGED_BYTES"
  }
}
```

`controls` must name exactly the changed control paths, with no unused path. SHA256 values describe Git blob contents, not Git object IDs. Missing review attribution, a changed base, deleted control, mismatched staged bytes or foreign staged path rejects the bootstrap. This is explicit review attribution and byte binding, not a cryptographic authentication service. No receipt was fabricated by the implementation author.

After the coordinator has staged and independently reviewed the exact owned scope, the standalone gate invocation is:

```sh
QUAKED_TEXTURE_GATE_BOOTSTRAP=/private/tmp/quaked-reviewed-gate-bootstrap.json node tools/distribution/precommit.mjs
```

For the actual normal commit, pass that same environment variable to the existing commit hook; a separately run gate is not a bypass. **Choose the real hook once after review:** a successful standalone gate occupies the pinned tree's exclusive destination, so a later hook for that identical tree will refuse it rather than overwrite or reuse evidence. Same-tree retry/retirement requires a separate explicit cleanup decision. Once these controls are landed, future wholly texture-only Dev checkpoints use the ordinary hook without a bootstrap variable. An unused bootstrap receipt is rejected. The receipt's `output` field and terminal message name the dedicated absolute destination.

The unchanged full local command list remains behind explicit `QUAKED_CHECKPOINT_MODE=full`, subject to separate full-build authority for that other work. The default texture route never falls back to it; direct Prod commits remain prohibited in every mode. Removing a blanket full-mode Dev rejection preserves other agents' separately authorized nontexture Dev checks without authorizing a full build for this campaign. This campaign did not invoke full mode. Full CI still includes Mac jobs on a later push, so a push requires separate scope/authority resolution rather than assuming local HTML-only execution makes remote native work acceptable.

## Focused public verification

`node --test tests/staged_contract_test.mjs` passed 12/12 with zero skips after the output-custody correction. Tests use disposable Git repositories and an injected command recorder; no real app/native build is executed. They cover index/working-file preservation, frozen export despite a later index write, scope and rename escape, unsafe modes, exact bootstrap binding, selected command lists, truthful success receipts, required failures, no successful publication after index movement, executing-control mismatch, foreign `dist/staged` sentinels, exclusive existing-destination/symlink protection, setup/export cleanup, and a real synthetic custody CLI with remapped/missing/changed input bytes.

`node --test --test-name-pattern='actual production pre-commit' tests/prod_promotion_contract_test.mjs` passed its one selected public hook test against the final source, with zero skips. Direct Prod pre-commit/pre-push restrictions remain exercised. An earlier combined 27-test staged/promotion run also passed, but preceded the final executing-control guard and additional fixture; its limited scope is recorded rather than attributed to later bytes.

The implementation author ran no actual checkpoint, HTML, app/Rust/distribution build, Git staging/commit/push, provider call or child. The coordinator owns independent code review and the subsequent real exact-index HTML checkpoint. The temporary implementation draft was removed; disposable test repositories and expected-failure snapshots were removed by their fixture cleanup.
