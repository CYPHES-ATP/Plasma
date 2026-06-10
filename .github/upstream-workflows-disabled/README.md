# Disabled upstream workflows

These workflows are retained for upstream merge reference but are intentionally
outside `.github/workflows`. They target anomalyco/OpenCode infrastructure,
secrets, publishing destinations, or Blacksmith runners that are not part of
the Plasma production environment.

Active Plasma automation lives in:

- `.github/workflows/plasma-ci.yml`
- `.github/workflows/plasma-release.yml`
