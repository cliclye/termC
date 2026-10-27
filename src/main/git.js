const path = require('node:path');
const fs = require('node:fs');
const { run } = require('./util');

// Never block on an HTTPS credential prompt: there is no terminal to answer it. (ssh already
// fails fast without a controlling terminal.) Optional locks off so polling never blocks your own git.
const git = (cwd, args, opts) => run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }, ...opts });

// Several panels poll status at once; share one result per repo for a short time.
const statusCache = new Map();
const invalidate = () => statusCache.clear();

async function must(cwd, args) {
  if (!cwd) throw new Error('Not a git repository');
  const r = await git(cwd, args);
  if (!r.ok) throw new Error((r.stderr || r.error || 'git failed').trim());
  return r.stdout;
}

async function root(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const r = await git(cwd, ['rev-parse', '--show-toplevel']);
  return r.ok ? r.stdout.trim() : null;
}

function status(cwd) {
  const hit = statusCache.get(cwd);
  if (hit && Date.now() - hit.at < 1500) return hit.promise;
  const promise = statusUncached(cwd).catch((e) => ({ repo: false, error: e.message }));
  statusCache.set(cwd, { at: Date.now(), promise });
  if (statusCache.size > 50) statusCache.delete(statusCache.keys().next().value);
  return promise;
}

async function init(cwd) {
  invalidate();
  return must(cwd, ['init']);
}

async function statusUncached(cwd) {
  const top = await root(cwd);
  if (!top) return { repo: false };
  const out = await must(top, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all']);
  const parts = out.split('\0');
  let branch = '';
  let upstream = '';
  let ahead = 0;
  let behind = 0;
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    if (e.startsWith('## ')) {
      const h = e.slice(3);
      const [local, remote] = h.replace(/^No commits yet on /, '').split('...');
      branch = remote === undefined ? local.split(' ')[0] : local;
      upstream = remote ? remote.split(' ')[0] : '';
      const a = h.match(/ahead (\d+)/);
      const b = h.match(/behind (\d+)/);
      ahead = a ? +a[1] : 0;
      behind = b ? +b[1] : 0;
      if (h.startsWith('HEAD (no branch)')) branch = 'HEAD (detached)';
      continue;
    }
    const x = e[0];
    const y = e[1];
    const file = e.slice(3);
    let from;
    if (x === 'R' || x === 'C') from = parts[++i];
    files.push({ path: file, from, index: x, worktree: y, staged: x !== ' ' && x !== '?', unstaged: y !== ' ', untracked: x === '?' });
  }
  return { repo: true, root: top, branch, upstream, ahead, behind, files };
}

async function diff(cwd, file, staged, untracked) {
  const top = (await root(cwd)) || cwd;
  if (untracked) {
    const r = await git(top, ['diff', '--no-index', '--', '/dev/null', file]);
    return r.stdout;
  }
  const args = ['diff', '--no-color', '-U3'];
  if (staged) args.push('--cached');
  if (file) args.push('--', file);
  return (await git(top, args)).stdout;
}

async function stage(cwd, files) {
  invalidate();
  const top = await root(cwd);
  return must(top, ['add', '-A', '--', ...(files?.length ? files : ['.'])]);
}

async function unstage(cwd, files) {
  invalidate();
  const top = await root(cwd);
  const head = await git(top, ['rev-parse', '--verify', 'HEAD']);
  if (!head.ok) return must(top, ['rm', '--cached', '-r', '-q', '--', ...(files?.length ? files : ['.'])]);
  return must(top, ['reset', '-q', 'HEAD', '--', ...(files?.length ? files : ['.'])]);
}

async function discard(cwd, file, untracked) {
  invalidate();
  const top = await root(cwd);
  if (untracked) return must(top, ['clean', '-f', '--', file]);
  return must(top, ['checkout', '--', file]);
}

async function commit(cwd, message, { amend = false, all = false } = {}) {
  invalidate();
  const top = await root(cwd);
  if (all) await must(top, ['add', '-A']);
  const args = ['commit', '-m', message];
  if (amend) args.push('--amend');
  return must(top, args);
}

async function remoteOp(cwd, op) {
  invalidate();
  const top = await root(cwd);
  const args = op === 'push' ? ['push'] : op === 'pull' ? ['pull', '--ff-only'] : ['fetch', '--all', '--prune'];
  const r = await git(top, args, { timeout: 120000 });
  if (!r.ok && op === 'push' && /no upstream branch/.test(r.stderr)) {
    const branch = (await must(top, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    return must(top, ['push', '-u', 'origin', branch]);
  }
  if (!r.ok) {
    const msg = r.stderr.trim() || r.error || '';
    if (/terminal prompts disabled|could not read Username|Permission denied \(publickey/.test(msg))
      throw new Error(`${op} needs credentials. Run "git ${op}" once in a terminal to sign in, then try again.`);
    throw new Error(msg);
  }
  return (r.stdout + r.stderr).trim();
}

async function log(cwd, limit = 200) {
  const top = await root(cwd);
  if (!top) return [];
  const r = await git(top, ['log', '--all', '--date-order', `-n${limit}`, '--format=%H%x1f%P%x1f%an%x1f%ar%x1f%s%x1f%D']);
  if (!r.ok) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, parents, author, date, subject, refs] = l.split('\x1f');
      return { hash, parents: parents ? parents.split(' ') : [], author, date, subject, refs: refs ? refs.split(', ').filter(Boolean) : [] };
    });
}

async function show(cwd, hash) {
  const top = await root(cwd);
  return must(top, ['show', '--stat', '--patch', '--no-color', '--format=commit %H%nAuthor: %an <%ae>%nDate:   %ad%n%n    %s%n%n%b', hash]);
}

async function branches(cwd) {
  const top = await root(cwd);
  if (!top) return [];
  const out = await must(top, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)%1f%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(committerdate:relative)', 'refs/heads', 'refs/remotes']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [ref, name, head, upstream, date] = l.split('\x1f');
      return { name, remote: ref.startsWith('refs/remotes/'), current: head === '*', upstream, date };
    })
    .filter((b) => !b.name.endsWith('/HEAD') && b.name !== 'origin');
}

async function checkout(cwd, branch, { create = false } = {}) {
  invalidate();
  const top = await root(cwd);
  if (create) return must(top, ['checkout', '-b', branch]);
  const remote = branch.match(/^([^/]+)\/(.+)$/);
  const local = await git(top, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (!local.ok && remote) {
    const rem = await git(top, ['rev-parse', '--verify', '--quiet', `refs/remotes/${branch}`]);
    if (rem.ok) return must(top, ['checkout', '--track', branch]);
  }
  return must(top, ['checkout', branch]);
}

async function worktrees(cwd) {
  const top = await root(cwd);
  if (!top) return [];
  const out = await must(top, ['worktree', 'list', '--porcelain']);
  const list = [];
  let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), branch: '', head: '', main: list.length === 0 };
      list.push(cur);
    } else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5, 12);
    else if (cur && line === 'detached') cur.branch = '(detached)';
    else if (cur && line.startsWith('locked')) cur.locked = true;
  }
  return list;
}

async function worktreeAdd(cwd, { branch, path: wtPath, newBranch = true, base }) {
  invalidate();
  const top = await root(cwd);
  if (!top) throw new Error('Not a git repository');
  const target = wtPath || path.join(path.dirname(top), `${path.basename(top)}-${branch.replace(/[^\w.-]+/g, '-')}`);
  const exists = await git(top, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  const args = ['worktree', 'add'];
  if (newBranch && !exists.ok) args.push('-b', branch, target, ...(base ? [base] : []));
  else args.push(target, branch);
  await must(top, args);
  return target;
}

async function worktreeRemove(cwd, wtPath, force = false) {
  invalidate();
  const top = await root(cwd);
  return must(top, ['worktree', 'remove', ...(force ? ['--force'] : []), wtPath]);
}

module.exports = { root, init, status, diff, stage, unstage, discard, commit, remoteOp, log, show, branches, checkout, worktrees, worktreeAdd, worktreeRemove };
