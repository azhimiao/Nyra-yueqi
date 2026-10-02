# Nyra Android release security

## One-time setup

```bash
npm run security:init-release
```

This creates the permanent Android release keystore and Ed25519 update-signing
identity under `~/.nyra/release/`. Only the Ed25519 public key and Android
certificate SHA-256 fingerprint are written into the repository.

Back up this directory immediately:

```text
~/.nyra/release/
```

Use an encrypted offline backup. Losing the Android keystore can prevent
installed copies from accepting future updates. Never commit or upload this
directory.

The bootstrap is idempotent. If it finds a partial identity, it fails instead
of silently rotating keys.

## Build a release

Set the desired SemVer in `package.json`, then run:

```bash
npm run release:android
```

The command:

1. builds and syncs the Capacitor app;
2. runs Gradle `assembleRelease` with the permanent keystore;
3. verifies the APK with Android SDK `apksigner`;
4. checks the signer certificate against the pinned repository fingerprint;
5. calculates APK SHA-256 and byte size;
6. creates and Ed25519-signs the schema v2 update manifest;
7. verifies the generated signature;
8. writes immutable artifacts under `dist/release/`.

Release Gradle tasks fail if signing variables are absent. They never use debug
signing as a fallback.

Optional flags:

```bash
npm run release:android -- --minimum-version 1.0.0
npm run release:android -- --mandatory
npm run release:android -- --notes-zh "更新说明" --notes-en "Release notes"
```

## Publish

```bash
npm run release:publish
```

Publishing verifies the local APK and signed manifest before any upload. It
uploads to a hidden staging directory, verifies the remote APK hash and size,
then activates the APK and installs the root-owned manifest at:

```text
/etc/yueqi-update-manifest.json
```

The Yueqi service can read this file but cannot replace it.

## Verification

```bash
npm run verify:release-security
npm run verify:release-artifacts
```

The client accepts only:

- schema v2 manifests signed by the pinned Ed25519 key;
- `https://download.memprism.com/...` download URLs;
- manifests containing APK SHA-256, byte size, and the pinned Android
  certificate fingerprint.

Android itself also requires an update APK to be signed by the same Android
application certificate as the installed app.
