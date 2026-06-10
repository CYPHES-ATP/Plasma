# Plasma Release Guide

## Activate GitHub Actions

GitHub requires a credential with the separate `workflow` permission to create
or update files under `.github/workflows`. The reviewed workflow definitions
are mirrored in `docs/workflows` so a repository import or restricted token
does not silently drop release automation.

With a workflow-authorized account:

```bash
mkdir -p .github/workflows
cp docs/workflows/plasma-ci.yml .github/workflows/plasma-ci.yml
cp docs/workflows/plasma-release.yml .github/workflows/plasma-release.yml
git add .github/workflows
git commit -m "ci: activate Plasma workflows"
git push
```

Confirm both workflows appear in the repository Actions tab before tagging a
release.

## CLI Release

1. Ensure `main` is green and the production checklist is complete.
2. Choose a semantic version.
3. Create and push an annotated tag:

   ```bash
   git tag -a v1.0.0 -m "Plasma v1.0.0"
   git push origin v1.0.0
   ```

4. `.github/workflows/plasma-release.yml` builds native CLI archives on Linux,
   macOS, and Windows and attaches them to the GitHub release.
5. Verify every archive contains `plasma` and the `opencode` compatibility
   alias.
6. Test the installer on clean supported machines.

## Desktop Release

The tagged release workflow builds, signs, and notarizes the macOS desktop
application. Configure these protected GitHub Actions secrets:

- `MACOS_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

The release fails closed when any signing credential is missing. It verifies
the resulting application with both `codesign` and Gatekeeper before attaching
the DMG and ZIP to the GitHub release.

For a local unsigned development preview:

```bash
OPENCODE_CHANNEL=prod bun --cwd packages/desktop build
OPENCODE_CHANNEL=prod bun --cwd packages/desktop package:mac:unsigned
```

Never publish the unsigned preview as a production release.

## Rollback

- mark the affected release as pre-release or remove it
- publish the last known-good signed artifacts
- document security impact and migration steps
- do not bypass the deployment gate to restore availability
