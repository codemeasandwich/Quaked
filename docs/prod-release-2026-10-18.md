# One selected Dev commit for Prod, releases and Pages

Owner requirements, 18 October 2026: Prod accepts no direct commits. It may only fast-forward to an explicitly selected commit already on Dev. That exact commit/version produces the downloadable release and GitHub Pages site.

Status: server safeguards and the App controller are active. Prod and `v0.132.4` identify the owner-selected Dev commit `51e01ac9c6bd4db3d0b784242ba6d13ef7575314`. [Prod CI39156979959](https://github.com/codemeasandwich/Quaked/actions/runs/39156979959) attempt2 passed after the original draft-lookup failure was recovered using the unchanged tested artifacts. Fourteen independent public checks verified the actual Mac download, Pages HTML and byte-identical common release identity. The draft-lookup repair below is a subsequent Dev change; it must pass the maintained gate and Dev CI independently and does not select another release or move Prod.

## Enforcement boundary

GitHub rulesets enforce the remote boundary, including ordinary owner/admin pushes. `prod-updates` restricts every Prod update; its sole bypass is the dedicated GitHub App. The separate `prod-history` ruleset blocks non-fast-forwards, deletion and recreation with **no bypass**, including for that App. `dev-history` blocks Dev rewrites/deletion so historical Dev membership remains stable.

A required status from the shared GitHub Actions App cannot identify a trusted workflow: another writable workflow can emit the same check name. GitHub also accepts skipped conditional jobs as successful checks. Consequently no shared Actions credential is given Prod update bypass. See the [security review](evidence/prod-release-2026-10-18/quaked-prod-enforcement-security-review.json).

The standalone promotion controller uses an App key and configuration outside Git and outside Actions. Install only an independently reviewed copy, pinned by SHA256 in its private configuration. It validates the selected full SHA against fresh Dev/Prod history, a successful Dev Distribution run, the release version/tag and prior publication state. The actual update is one GitHub `updateRefs` transaction containing Prod (`beforeOid`=observed old Prod, `afterOid`=selected SHA, `force:false`) and its new version tag (`beforeOid`=zero, `afterOid`=the same SHA, `force:false`). All updates are atomic: changed Prod or an already existing tag rejects both updates. A push acknowledgement is not completed release publication.

The local pre-commit and pre-push hooks reject direct Prod commits/pushes early. Hooks are convenience safeguards and can be bypassed locally; the server ruleset remains the enforcement boundary.

## Publication

The Distribution workflow uses one builder/test pipeline. Dev, pull requests and manual verification do not publish. A Prod push uses its immutable event SHA for every checkout and derives the release version from that commit's package metadata. Version-tag pushes are not an alternate release path. Only the dedicated App may create version tags, while a separate no-bypass rule makes existing version tags immutable. The publisher refuses a missing tag; it cannot create one itself. This also blocks historical tagged commits from running an older tag-triggered publisher.

Keep the complete web HTTP/file/tamper browser trials, both Mac runners, Rust/engine/LAN tests, universal builds and archive checks. Publishing uses those tested artifacts without rebuilding them. Shared release metadata binds commit, version, tag, web HTML and Mac archive identities, and is attached both to the release and Pages. Pages depends on successful release publication. Neither an existing version tag at another commit nor a mismatched artifact may be overwritten.

Release and Pages are separate GitHub operations, not an atomic transaction. Failed/partial publication must remain visible and be retried at the same commit/version with matching artifacts. Do not move Prod backward or select another commit to hide an incomplete publication.

## History repair

The historical Prod commits `907d5cde` and `3f2084c0` were ported into Dev through `55b8aa43` and `9fef6cfe`. The explicit two-parent merge `5608cd50251103c26f6411273073854640791112` records that ancestry while retaining the previous Dev tree exactly (`9fbd06ce379523d79eb826366b8b2059d368ef40`). Its full maintained gate passed. Prod did not move during that reconciliation; the later release promotion selected the commit in Status above. This is a specific reconciliation of verified ports, not permission to discard future Prod changes through an ours merge.

## App setup and verification

The owner-created App `5370616` has installation `172763747`, limited to Quaked. Its key fingerprint matches GitHub, App JWT authentication verifies its identity, and a temporary installation token was checked for exactly Quaked with Contents/Workflows write and Actions read, then revoked. Keep its private key outside the repository/Actions. Its Integration ID bypass is active only on `prod-updates` and `version-tag-create`; do not add any bypass on either history ruleset or Dev history.

Live verification also showed that GitHub omits `bypass_actors` from App ruleset responses: [that field requires write access to the ruleset](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset). Giving the promotion App Administration write would let it weaken its own protections. Instead, the same standalone controller uses the operator's existing authenticated GitHub CLI only for five fixed ruleset GETs. The private config binds an absolute trusted `ghPath`; the reader resolves and checks that executable, fixes the host/method/endpoints, strips ambient tokens/debugging, disables prompts and limits execution to 30 seconds and 1 MiB. Missing actor lists or unreadable policies still reject promotion. The App retains only its original permissions and performs the fresh source/CI checks and atomic ref update. The operator credential remains privileged within the existing trusted local account boundary, although this reader issues no writes.

Package version `0.132.4` is already released at the commit in Status. A future release needs a new version and a newly qualified Dev commit, except for a proven retry of that same published commit. The current publisher repair grants no new release selection.

Bluey `agent_whoami` still reports the session retired; the last same-session reactivation failed storage with correlation `9bbae6b3b25b4460b16a1d2ac9974445` and unknown mutation outcome. No card update is claimed. The initiating coordinator owns the work and retains this record plus `dist/publisher-draft-fix/progress.json`; reconcile the existing feature with Bluey once its service owner repairs the identity/storage path. Do not invent another registration or replay the unknown mutation blindly.

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
local Prod alignment must also be fast-forward only. Use `git merge --ff-only` in
its own checkout. For a local Prod mirror that is not checked out, first verify
the selected full SHA is the remote Prod/tag target and descends from local Prod,
then use `git fetch --no-tags . FULL_RELEASE_SHA:refs/heads/Prod`. Git's normal
non-forced branch-fetch check enforces the fast-forward without switching the Dev
checkout. Do not use a `+` refspec, `--force` or `--update-head-ok`; verify the
primary HEAD/index/worktree are unchanged afterwards.

A second selection is blocked until the current Prod push has an acknowledged,
successful publication run. The only explicit bootstrap exception is the original
legacy Prod SHA `3f2084c0`; it predates this pipeline. Repeated selection of the
already-current commit does not produce another push: retry its recorded failed
workflow jobs instead. Failed draft uploads remain unpublished; missing assets
can be uploaded on a retry using the same retained artifacts, never clobbered.
An existing published identity may be reused only when commit/version/web bytes
and the original Mac asset digests still match. A different source or existing
version tag is a hard refusal.

### Draft lookup and interrupted publication

GitHub's [release-by-tag endpoint](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name)
returns published releases. An unpublished draft can exist while that endpoint
returns 404, as happened in the original `v0.132.4` publication. The publisher
therefore discovers drafts through the authenticated release list and binds them
to their numeric release ID. It exhausts pages of 100 releases, with a ten-page
limit; a malformed or incomplete inventory, duplicate matching tag, wrong target commit,
prerelease, or any error other than the initial tag lookup's 404 stops publication.
It never treats an authorization or service failure as permission to create a draft.

If no matching release exists, the existing release API creates the draft with
the selected full commit and returns its ID. The publisher validates that response
and reads the draft by ID before checking assets. Existing assets must have one
of the four expected names, with no duplicates, and their sizes and SHA256 digests
must match the retained artifact files before any missing file is uploaded.
An interrupted draft with assets but no common `release.json` identity is refused.
Uploads still use the native GitHub release client without replacement flags.

After uploading, the publisher reads the same draft ID, verifies all four asset
digests and the common identity, then publishes that ID with only `draft:false`
and `make_latest:"true"`. It checks the published response before producing the
identity artifact consumed by Pages. It never uses a published-release lookup to
read an unpublished draft. The existing published-release retry path continues
to verify and reuse its original Mac archive rather than replace it with a rebuild.

Regression tests run the actual publication CLI in disposable Git repositories
against a transport that returns 404 for drafts at the published tag endpoint.
They cover creation, paginated discovery, interrupted uploads, identity conflicts,
and immutable published-release reuse without writing to GitHub. Dev CI qualifies
the code and these tests; it does not create a test production release.

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
Isolated Python startup and10s traceback diagnostics were added. That probe proved
proxy isolation, without establishing the original timeout's sole cause. The
following hosted traceback identified another blocking call. See the retained
before/after probe and CI triage.

Fresh Dev CI `39146154576` then failed the same deadline on both macOS jobs. Its
10-second traceback identifies `socket.getfqdn` in `HTTPServer.server_bind` during
fixture construction on Python 3.14.7. The test-only server now performs the actual
TCP bind directly and assigns its numeric loopback name and bound port. Constructor
regressions refuse both reverse-DNS entry points; all existing real HTTP requests,
proxy isolation, range and traversal assertions remain. Production `tools/serve.py`
and the 5-second request / 15-second parent deadlines are unchanged. Later Dev CI
`39150178037` passed both hosted Mac jobs, as did the selected release's Dev CI
`39154316332` and Prod CI `39156979959`. These historical results do not qualify
the subsequent publisher repair: its own commit must pass fresh Dev CI.

App authentication, policy activation, source qualification and publication are
separate evidence. The completed `v0.132.4` publication and public checks described
in Status apply to that selected release commit. The subsequent Dev publisher
repair does not select another commit for Prod, create a version tag or publish
another release. Its synthetic CLI tests and fresh Dev CI qualify the repair;
they must not be described as another live publication acceptance.
