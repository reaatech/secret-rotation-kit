// Docker image build helper: promote the provider packages and their cloud
// SDKs from optional peers/devDeps to real dependencies of the sidecar so a
// production install bundles every provider into the image. Not used outside
// the Docker build.
import { readFileSync, writeFileSync } from 'node:fs';

const file = './packages/sidecar/package.json';
const pkg = JSON.parse(readFileSync(file, 'utf8'));

const runtimeDeps = {
  '@reaatech/secret-rotation-provider-aws': 'workspace:*',
  '@reaatech/secret-rotation-provider-gcp': 'workspace:*',
  '@reaatech/secret-rotation-provider-vault': 'workspace:*',
  '@reaatech/secret-rotation-provider-vercel': 'workspace:*',
  '@aws-sdk/client-secrets-manager': '^3.1049.0',
  '@google-cloud/secret-manager': '^5.0.0',
  'node-vault': '^0.10.0',
};

pkg.dependencies = { ...pkg.dependencies, ...runtimeDeps };
for (const name of Object.keys(runtimeDeps)) {
  pkg.devDependencies?.[name] && delete pkg.devDependencies[name];
  pkg.peerDependencies?.[name] && delete pkg.peerDependencies[name];
  pkg.peerDependenciesMeta?.[name] && delete pkg.peerDependenciesMeta[name];
}

writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('bundled providers + SDKs into sidecar dependencies');
