"""Documentation links: README.md, docs/index.md and docs/technical-notes.md.

Run: python3 tests/docs_index_test.py   (exits 1 and lists each failure)

Checks, against the files on disk:
  * every relative Markdown link and <img src> in the three entry documents resolves to a file that git tracks
    or would add (exact letter case, so it works on GitHub Pages; ignored files do not count), and every
    #anchor names a heading of the target document (GitHub's slug rules);
  * docs/index.md is current (what tools/build_docs_index.py would write);
  * every docs/*.md except the index is linked from the index or is technical-notes.md;
  * the README is short (a welcome, not a manual) and links both the index and the technical notes.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
ENTRY = [ROOT / 'README.md', DOCS / 'index.md', DOCS / 'technical-notes.md']
LINK = re.compile(r'\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|src="([^"]+)"')
MAX_README_LINES = 140


def links(path):
	out = []
	for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
		for a, b in LINK.findall(line):
			out.append((n, a or b))
	return out


def tracked():
	"""Every file git has or would add (untracked, not ignored), as exact-case relative paths."""
	out = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, text=True)
	return set(out.splitlines())


def slugs(path):
	"""GitHub heading anchors of a Markdown file (outside code fences), with -1, -2 for repeats."""
	seen, out, fenced = {}, set(), False
	for line in path.read_text(encoding='utf-8').splitlines():
		if line.startswith('```'):
			fenced = not fenced
		elif not fenced and re.match(r'#{1,6} ', line):
			s = re.sub(r'[^\w\- ]', '', re.sub(r'`|\*|\[|\]\([^)]*\)', '', line.lstrip('#').strip().lower())).replace(' ', '-')
			k = seen.get(s, 0)
			seen[s] = k + 1
			out.add(s if k == 0 else '%s-%d' % (s, k))
	return out


def main():
	bad = []
	files = tracked()
	for path in ENTRY:
		for n, target in links(path):
			if re.match(r'[a-z]+:', target) or target.startswith('#'):
				continue  # absolute URL or in-page anchor
			name, _, anchor = target.partition('#')
			file = (path.parent / name).resolve() if name else path
			rel = file.relative_to(ROOT).as_posix()
			if rel not in files:
				bad.append('%s:%d broken link %s (missing, ignored, or wrong letter case)' % (path.relative_to(ROOT), n, target))
			elif anchor and anchor not in slugs(file):
				bad.append('%s:%d no heading #%s in %s' % (path.relative_to(ROOT), n, anchor, rel))
	if subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_docs_index.py'), '--check']).returncode != 0:
		bad.append('docs/index.md is out of date: run python3 tools/build_docs_index.py')
	indexed = {t.split('#')[0] for _, t in links(DOCS / 'index.md')}
	for p in sorted(DOCS.glob('*.md')):
		if p.name not in indexed and p.name not in ('index.md', 'technical-notes.md'):
			bad.append('docs/%s is not in the index' % p.name)
	readme = (ROOT / 'README.md').read_text(encoding='utf-8')
	n = len(readme.splitlines())
	if n > MAX_README_LINES:
		bad.append('README.md is %d lines (limit %d): move detail to docs/technical-notes.md' % (n, MAX_README_LINES))
	readme_links = {(ROOT / 'README.md').parent.joinpath(t.split('#')[0]).resolve().relative_to(ROOT).as_posix() for _, t in links(ROOT / 'README.md') if not re.match(r'[a-z]+:', t)}
	for needed in ('docs/index.md', 'docs/technical-notes.md'):
		if needed not in readme_links:
			bad.append('README.md does not link ' + needed)
	for b in bad:
		print('FAIL', b)
	print('docs links: %d problem(s)' % len(bad))
	return 1 if bad else 0


if __name__ == '__main__':
	sys.exit(main())
