import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const javaImage = process.env.JAVA_IMAGE;
if (!javaImage || !/^[a-zA-Z0-9/_.:-]+$/.test(javaImage)) throw new Error('Set JAVA_IMAGE to the existing Java release image.');
const composePath = process.argv[2]
    || fileURLToPath(new URL('../../myJavaWebSite/backend/deploy/compose.yaml', import.meta.url));
const files = new Map();
for (const filename of ['Dockerfile', 'nginx.conf', 'proxy_params.conf']) {
    files.set(filename, await readFile(path.join(root, 'deploy', filename)));
}
for (const filename of ['index.html', 'app.js', 'backend.js', 'browser.js', 'tools.js', 'json.js', 'styles.css']) {
    files.set(`public/${filename}`, await readFile(path.join(root, 'dist', filename)));
}
files.set('compose.yaml', await readFile(composePath));
const hash = createHash('sha256').update(javaImage);
for (const [filename, content] of files) hash.update(filename).update(content);
const releaseId = `toolbox-${hash.digest('hex').slice(0, 12)}`;
const image = `shiyong-toolbox:${releaseId}`;
const outputRoot = path.join(root, '.sites-local', releaseId);
for (const [filename, content] of files) {
    const destination = path.join(outputRoot, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
}
await writeFile(path.join(outputRoot, 'release.env'), `JAVA_IMAGE=${javaImage}\nTOOLBOX_IMAGE=${image}\n`);
const archive = path.join(root, '.sites-local', `${releaseId}.tar.gz`);
execFileSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-C', outputRoot, '-czf', archive, '.']);
const release = { release_id: releaseId, image, java_image: javaImage, archive };
await writeFile(path.join(root, '.sites-local', 'ecs-frontend-release.json'), JSON.stringify(release, null, 2));
console.log(JSON.stringify(release));
