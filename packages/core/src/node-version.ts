const MIN_NODE_MAJOR = 20;

export function assertNodeVersion(): void {
  if (typeof process === 'undefined' || typeof process.versions?.node !== 'string') {
    return;
  }
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (nodeMajor < MIN_NODE_MAJOR) {
    throw new Error(
      `@reaatech/secret-rotation-kit requires Node.js >= ${MIN_NODE_MAJOR}. Current version: ${process.versions.node}`,
    );
  }
}
