// After `vite build` of the public site (VITE_HANGAR_SITE=1): the site is served as plain files
// (docker/site.nginx.conf), so every page gets its own index.html (a copy of the app's), and
// anything else gets the app through 404.html. The site serves no scripts: the install command
// downloads from the GitHub release (D41).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'frontend/dist-site')
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
console.log(`Site ready in ${path.relative(root, out)}: ${pages.length} pages`)
