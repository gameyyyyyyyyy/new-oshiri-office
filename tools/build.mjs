import { readdir, mkdir, copyFile, rm, lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, '_site');
const allowed = new Set(['.js','.css','.woff2','.jpeg','.jpg','.png','.glb','.mp3','.m4a']);
await rm(out, {recursive:true,force:true}); await mkdir(out,{recursive:true});
await writeFile(join(out,'.nojekyll'), '');
for (const file of ['index.html','about.html','vendor/three/LICENSE','assets/fonts/OFL.txt']) {
  await mkdir(join(out,file,'..'),{recursive:true}); await copyFile(join(root,file),join(out,file));
}
async function walk(folder) {
  for (const item of await readdir(join(root,folder),{withFileTypes:true})) {
    if (item.name.startsWith('.')) continue;
    const file=join(folder,item.name);const info=await lstat(join(root,file));
    if (info.isSymbolicLink()) throw new Error('Symlinks are not deployable: '+file);
    if (info.isDirectory()) await walk(file);
    else if (allowed.has(extname(file))) {
      await mkdir(join(out,file,'..'),{recursive:true});await copyFile(join(root,file),join(out,file));
    }
  }
}
for (const dir of ['js','assets','vendor']) await walk(dir);
const html=await readFile(join(out,'index.html'),'utf8');
if (!html.includes('Content-Security-Policy')) throw new Error('Missing CSP');
console.log('Built _site from explicit runtime directories; development files excluded.');
