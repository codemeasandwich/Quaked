# One selected Dev commit for Prod, releases and Pages

Owner requirements, 18 October 2026: Prod accepts no direct commits. It may only fast-forward to an explicitly selected commit already on Dev. That exact commit/version produces the downloadable release and GitHub Pages site.

Status: server safeguards and the controller/workflow are implemented. The owner registered and installed the dedicated App on Quaked; its local key and restricted token have been verified. The two activation payloads below allow only that App to update Prod and create a version tag. All history rules retain no bypass. Prod remains at `3f2084c043eec0108bc70f12fd47f4d5060a53ff`; no release commit or new version has been selected. First real promotion, release and Pages publication remain unqualified until performed at an owner-selected commit.

## Enforcement boundary

GitHub rulesets enforce the remote boundary, including ordinary owner/admin pushes. `prod-updates` restricts every Prod update; its eventual sole bypass is a dedicated GitHub App. The separate `prod-history` ruleset blocks non-fast-forwards, deletion and recreation with **no bypass**, including for that App. `dev-history` blocks Dev rewrites/deletion so historical Dev membership remains stable.

A required status from the shared GitHub Actions App cannot identify a trusted workflow: another writable workflow can emit the same check name. GitHub also accepts skipped conditional jobs as successful checks. Consequently no shared Actions credential is given Prod update bypass. See the [security review](evidence/prod-release-2026-10-18/quaked-prod-enforcement-security-review.json).

The standalone promotion controller uses an App key and configuration outside Git and outside Actions. Install only an independently reviewed copy, pinned by SHA256 in its private configuration. It validates the selected full SHA against fresh Dev/Prod history, a successful Dev Distribution run, the release version/tag and prior publication state. The actual update is one GitHub `updateRefs` transaction containing Prod (`beforeOid`=observed old Prod, `afterOid`=selected SHA, `force:false`) and its new version tag (`beforeOid`=zero, `afterOid`=the same SHA, `force:false`). All updates are atomic: changed Prod or an already existing tag rejects both updates. A push acknowledgement is not completed release publication.

The local pre-commit and pre-push hooks reject direct Prod commits/pushes early. Hooks are convenience safeguards and can be bypassed locally; the server ruleset remains the enforcement boundary.

## Publication

The existing Distribution workflow is being adapted; there is one builder/test pipeline. Dev, pull requests and manual verification do not publish. A Prod push uses its immutable event SHA for every checkout and derives the release version from that commit's package metadata. Version-tag pushes are not an alternate release path. A creation gate blocks version tags until the dedicated App is allowed, while a separate no-bypass rule makes existing version tags immutable. The publisher refuses a missing tag; it cannot create one itself. This also blocks historical tagged commits from running an older tag-triggered publisher.

Keep the complete web HTTP/file/tamper browser trials, both Mac runners, Rust/engine/LAN tests, universal builds and archive checks. Publishing uses those tested artifacts without rebuilding them. Shared release metadata binds commit, version, tag, web HTML and Mac archive identities, and is attached both to the release and Pages. Pages depends on successful release publication. Neither an existing version tag at another commit nor a mismatched artifact may be overwritten.

Release and Pages are separate GitHub operations, not an atomic transaction. Failed/partial publication must remain visible and be retried at the same commit/version with matching artifacts. Do not move Prod backward or select another commit to hide an incomplete publication.

## History repair

The historical Prod commits `907d5cde` and `3f2084c0` were ported into Dev through `55b8aa43` and `9fef6cfe`. The explicit two-parent merge `5608cd50251103c26f6411273073854640791112` records that ancestry while retaining the previous Dev tree exactly (`9fbd06ce379523d79eb826366b8b2059d368ef40`). Its full maintained gate passed. Prod itself did not move. This is a specific reconciliation of verified ports, not permission to discard future Prod changes through an ours merge.

## Pending owner setup and verification

The owner-created App `5370616` has installation `172763747`, limited to Quaked. Its key fingerprint matches GitHub, App JWT authentication verifies its identity, and a temporary installation token was checked for exactly Quaked with Contents/Workflows write and Actions read, then revoked. Keep its private key outside the repository/Actions. Grant its Integration ID bypass only on `prod-updates` and `version-tag-create`; do not add any bypass on either history ruleset or Dev history.

Live verification also showed that GitHub omits `bypass_actors` from App ruleset responses: [that field requires write access to the ruleset](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset). Giving the promotion App Administration write would let it weaken its own protections. Instead, the same standalone controller uses the operator's existing authenticated GitHub CLI only for five fixed ruleset GETs. The private config binds an absolute trusted `ghPath`; the reader resolves and checks that executable, fixes the host/method/endpoints, strips ambient tokens/debugging, disables prompts and limits execution to 30 seconds and 1 MiB. Missing actor lists or unreadable policies still reject promotion. The App retains only its original permissions and performs the fresh source/CI checks and atomic ref update. The operator credential remains privileged within the existing trusted local account boundary, although this reader issues no writes.

The existing package version `0.132.3` is already released, so the future selected release commit needs a new version (or a proven same-commit retry). No current commit is being selected for release by this configuration task.

Bluey `agent_whoami` still reports the session retired; same-session reactivation failed storage with correlation `53c818963cf04744b1473f48a687bfe4`. No card update is claimed. The initiating coordinator owns the work and retains this record plus `dist/prod-release-progress.json`; reconcile with Bluey once its identity/storage path works.

## Active remote rules and setup

| Ruleset | ID | Rule | Bypass |
| --- | --- | --- | --- |
| `prod-updates` | 25348047 | All Prod updates restricted | Only Integration `5370616` |
| `prod-history` | 25348048 | Prod non-FF/deletion/recreation forbidden | None, including the App |
| `dev-history` | 25348049 | Dev non-FF/deletion forbidden | None |
| `version-tag-create` | 25348916 | New `v*` tags restricted | Only Integration `5370616` |
| `version-tag-history` | 25348918 | Existing `v*` tags cannot update/delete | None, including the App |

The Pages environment allows only the `Prod` branch. The deployed site has not
been changed by these configuration edits. `data` remains outside the version-tag
rules, retaining the existing immutable content-part uploader.

The App key is kept on a trusted local operator account. It is not placed in
Git, Actions, shared build outputs or chat. A same-user hostile local process is
outside this credential-isolation boundary; use a separate account/secret store
if the release host cannot be trusted. Repository admins can explicitly edit
rulesets, but they have no ordinary push bypass while these rules are active.

### One-time owner action

The owner registered [Quaked Cut Release](https://github.com/settings/apps/quaked-cut-release),
App ID `5370616`, owned by `codemeasandwich`. Its signed-in settings and permissions
were checked on 18 October 2026. The owner generated its key and approved installation
only on Quaked. Installation identity and restricted authentication were verified;
registration alone is not proof of a working production release.
The [reviewable App manifest](release-app-manifest.json) requires repository
Contents write (update existing refs), Workflows write (promotion can include
workflow changes already committed on Dev), and Actions read (verify qualification
and pending runs); Metadata read is implicit. It requests no administration,
account, secret or webhook permission. Keep it private and install it only on
`Quaked`. Generate/download its private key directly to a private local directory.
The App ID, installation ID and local key pathname are metadata needed for setup;
never send the key contents through chat.

Use the [private configuration example](release-app-config.example.json), replacing
its placeholders outside Git. Install a copy of the controller from the exact
independently reviewed configuration commit, not from a subsequently moving Dev:

```sh
quaked_release_dir="$HOME/Library/Application Support/Quaked Release"
mkdir -p "$quaked_release_dir"
chmod 700 "$quaked_release_dir"
git show REVIEWED_CONFIG_COMMIT:tools/distribution/promote.mjs > "$quaked_release_dir/promote.mjs"
chmod 700 "$quaked_release_dir/promote.mjs"
shasum -a 256 "$quaked_release_dir/promote.mjs"
```

Record that SHA256 in `controllerSha256`, use absolute config/key paths and
owner-only file permissions (`chmod 600`). Verify the App's actual ID against its
key/owner/installation before changing bypass permissions. Only that dedicated
Integration ID goes on the two creation/update gates above; do not use installation
ID, a repository role, an admin bypass or the shared `github-actions` App.
The controller validates these live policies and revokes each repository-scoped
installation token on every subsequent success/rejection path. API calls have
30-second limits. Revocation failure reports whether Prod was acknowledged;
unknown or mismatched ref readback requires inspection before retrying.
Set `ghPath` to the installed GitHub CLI and authenticate the operator normally with
`gh auth login`. That login must be able to inspect ruleset bypass lists. No operator
token is extracted or passed to the App, and no App token/key is passed to the CLI.

### Select and promote a release

Prepare an unused numeric version on Dev first. `package.json`, `package-lock.json`
(root and package versions), `src-tauri/Cargo.toml` and its `Cargo.lock` package
version must agree; Tauri delegates to
`package.json`. Wait for that exact commit's successful Dev Distribution run.
Use Node 24 and an explicit full commit SHA:

```sh
node "$quaked_release_dir/promote.mjs" --sha FULL_DEV_SHA
node "$quaked_release_dir/promote.mjs" --sha FULL_DEV_SHA --apply --config "$quaked_release_dir/config.json"
```

The first command is a read-only plan. The second is a release action requiring
owner selection of that SHA; it does not build, create commits, choose latest Dev
or silently retry. The controller atomically moves remote Prod and creates its
version tag. It reports publication as pending, then the Prod push workflow tests
and publishes the same source. It does not rewrite an existing tag, bypass history
rules or make a commit on Prod. Refresh local tracking with `git fetch origin`;
any local Prod alignment must likewise use `git merge --ff-only`.

A second selection is blocked until the current Prod push has an acknowledged,
successful publication run. The only explicit bootstrap exception is the original
legacy Prod SHA `3f2084c0`; it predates this pipeline. Repeated selection of the
already-current commit does not produce another push: retry its recorded failed
workflow jobs instead. Failed draft uploads remain unpublished; missing assets
can be uploaded on a retry using the same retained artifacts, never clobbered.
An existing published identity may be reused only when commit/version/web bytes
and the original Mac asset digests still match. A different source or existing
version tag is a hard refusal.

### Verify completion

A successful workflow must have web, both Mac legs, release and Pages jobs green.
Read `release.json` from both the GitHub release and
`https://codemeasandwich.github.io/Quaked/release.json`; their bytes/digests,
commit, version, tag and web HTML identity must agree, and the Mac ZIP must match
its recorded SHA256. The Pages job checks the upstream HTML/identity digests
before deploying. GitHub release and Pages cannot be committed atomically; a
partial failure stays incomplete and is retried at the same source identity.
No actual production push/release is used as a negative protection probe here.

## Verification evidence and limits

The unchanged tree of the ancestry reconciliation and its two parents are
verified separately from the release wiring. Public controller tests use synthetic
App/RSA/API transport and disposable Git repositories: no live App or Prod mutation
is implied. Artifact tests exercise the real CLI against a fake `gh` transport,
including draft upload failure/retry and immutable published-asset reuse. The
workflow is parsed/linted with official actionlint 1.7.12 (verified release checksum).
The full maintained commit gate and subsequent Dev CI remain distinct evidence.

Prior Dev CI39139123633 failed its existing15-second Python HTTP subprocess gate.
The original fixture consulted host proxy discovery (independent probe:4expected
failures when discovery is refused); the isolated loopback fixture now passes5/5
normally and with discovery refused, making zero discovery calls. The request5s
and outer15s deadlines and all original security/range assertions remain intact.
Isolated Python startup and10s traceback diagnostics were added. This proves the
fixture isolation fix; the original CI timeout's sole root cause is not asserted
without a fresh CI run. See the retained before/after probe and CI triage.

Fresh Dev CI `39146154576` then failed the same deadline on both macOS jobs. Its
10-second traceback identifies `socket.getfqdn` in `HTTPServer.server_bind` during
fixture construction on Python 3.14.7. The test-only server now performs the actual
TCP bind directly and assigns its numeric loopback name and bound port. Constructor
regressions refuse both reverse-DNS entry points; all existing real HTTP requests,
proxy isolation, range and traversal assertions remain. Production `tools/serve.py`
and the 5-second request / 15-second parent deadlines are unchanged. A fresh Dev
CI run is still required to verify this correction on the hosted runners.

App authentication and installation scope are verified separately from policy
activation and source qualification. The first real selected release remains
pending an unused version and explicit owner-selected Dev commit with successful
CI. No Prod movement, version tag creation or real release publication has been
performed by this configuration work. Source/build and read-only authentication
verification must not be described as that live publication acceptance.
