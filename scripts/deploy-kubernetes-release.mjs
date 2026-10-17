import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const overlaysRoot = path.join(root, 'deploy/kubernetes/overlays')
const [mode, registry, tag] = process.argv.slice(2)

if (!['--render', '--apply'].includes(mode)) throw new Error('Usage: node scripts/deploy-kubernetes-release.mjs --render|--apply <ecr-registry> <immutable-tag>')
if (!/^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$/.test(registry ?? '')) {
  throw new Error('ECR registry must be an AWS account registry hostname such as 123456789012.dkr.ecr.eu-central-1.amazonaws.com.')
}
if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag ?? '')) {
  throw new Error('Release image tag must be a valid immutable container tag.')
}

const imageNames = [
  'local-demo-api',
  'vehicle-registry-service',
  'vehicle-status-service',
  'telemetry-ingestion-service',
  'fleet-operations',
  'customer-portal',
]
const images = imageNames.map((name) => [
  `  - name: roadsphere/${name}`,
  `    newName: ${registry}/roadsphere/${name}`,
  `    newTag: ${tag}`,
].join('\n')).join('\n')
const kustomization = [
  'apiVersion: kustomize.config.k8s.io/v1beta1',
  'kind: Kustomization',
  'resources:',
  '  - ../../base',
  'images:',
  images,
  '',
].join('\n')

await mkdir(overlaysRoot, { recursive: true })
const releaseDir = await mkdtemp(path.join(overlaysRoot, '.release-'))
try {
  await writeFile(path.join(releaseDir, 'kustomization.yaml'), kustomization, { encoding: 'utf8', flag: 'wx' })
  const rendered = spawnSync('kubectl', ['kustomize', releaseDir], { cwd: root, encoding: 'utf8' })
  if (rendered.error) throw rendered.error
  if (rendered.status !== 0) throw new Error(rendered.stderr || 'kubectl kustomize failed.')

  if (mode === '--render') {
    process.stdout.write(rendered.stdout)
  } else {
    const applied = spawnSync('kubectl', ['apply', '--filename=-'], {
      cwd: root,
      encoding: 'utf8',
      input: rendered.stdout,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    if (applied.error) throw applied.error
    if (applied.status !== 0) throw new Error(`kubectl apply exited with status ${applied.status}.`)
  }
} finally {
  const resolvedRoot = path.resolve(overlaysRoot) + path.sep
  const resolvedRelease = path.resolve(releaseDir)
  if (!resolvedRelease.startsWith(resolvedRoot) || !path.basename(resolvedRelease).startsWith('.release-')) {
    throw new Error('Refusing to clean a generated Kubernetes overlay outside its temporary directory.')
  }
  await rm(resolvedRelease, { recursive: true, force: true })
}
