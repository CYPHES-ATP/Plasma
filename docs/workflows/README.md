# GitHub Workflow Templates

These files are exact mirrors of Plasma's CI and release workflows:

- `plasma-ci.yml` validates typechecks, security tests, app tests, web and
  desktop builds, the native CLI, and installer syntax.
- `plasma-release.yml` builds multi-platform CLI archives and a Developer ID
  signed, hardened, notarized macOS desktop application.

GitHub requires the publishing credential to have the separate `workflow`
permission before files can be placed under `.github/workflows`.

Activate the templates with:

```bash
mkdir -p .github/workflows
cp docs/workflows/plasma-ci.yml .github/workflows/plasma-ci.yml
cp docs/workflows/plasma-release.yml .github/workflows/plasma-release.yml
git add .github/workflows
git commit -m "ci: activate Plasma workflows"
git push
```

The release workflow also requires the protected Apple signing secrets listed
in [the release guide](../RELEASE.md).
