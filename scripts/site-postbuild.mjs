// After `vite build` of the public site (VITE_HANGAR_SITE=1): GitHub Pages serves files, not an
// app, so every page gets its own index.html (a copy of the app's), and anything else gets the
// app through 404.html. Also writes install.sh for this release, and the custom domain.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'frontend/dist-site')
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
const index = path.join(out, 'index.html')

const guides = readdirSync(path.join(root, 'docs/guides'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/${f.replace(/\.md$/, '')}`)
const pages = ['docs', 'install', 'privacy', 'tour', ...guides]
for (const page of pages) {
  mkdirSync(path.join(out, page), { recursive: true })
  copyFileSync(index, path.join(out, page, 'index.html'))
}
copyFileSync(index, path.join(out, '404.html'))

const bootstrap = readFileSync(path.join(root, 'installer/bootstrap.sh'), 'utf8')
writeFileSync(path.join(out, 'install.sh'), bootstrap.replaceAll('__HANGAR_VERSION__', version))
writeFileSync(path.join(out, 'CNAME'), 'hangar.benduffaut.com\n')
// GitHub Pages would otherwise skip files and folders starting with an underscore.
writeFileSync(path.join(out, '.nojekyll'), '')
console.log(
  `Site ready in ${path.relative(root, out)}: ${pages.length} pages, install.sh for ${version}`,
)
