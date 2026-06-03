#!/usr/bin/env node
/**
 * committable-privacy-guard.cjs — project-local, committable-aware privacy guard.
 *
 * Replaces the GLOBAL privacy-block for this repo (which is neutralized via
 * .claude/.ck.json { "privacyBlock": false }). Lives at the project level so it
 * survives global-hook auto-updates.
 *
 * Policy (read/write file access on sensitive-named files):
 *   - Sensitive file (.env*, credentials, secrets.y(a)ml, *.pem, *.key, id_rsa/ed25519)
 *     that is GITIGNORED (a real local secret store) → BLOCK; ask user, then read via
 *     `bash cat` (Bash is never blocked here).
 *   - Committable file (NOT gitignored, e.g. client .env.production tracked in git) →
 *     ALLOWED freely. Its content is destined for git anyway, so the approval friction
 *     adds no protection — only wastes tokens / multi-step handling.
 *
 * Matchers (.claude/settings.json): Read|Edit|Write|MultiEdit|NotebookEdit
 *   (Bash is intentionally not matched — content-secret scanning of shell commands is
 *    write-secret-scanner.cjs's job; bash reads stay frictionless.)
 *
 * Fail-open: any parse/git error → exit 0 (allow) so the guard never wedges the session.
 */

const path = require('path');

// example/sample/template files are never sensitive
const SAFE_PATTERNS = [/\.example$/i, /\.sample$/i, /\.template$/i];

// sensitive-by-name files (mirror of the global privacy-block patterns)
const PRIVACY_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /\.env$/,
  /\/\.env\./,
  /credentials/i,
  /secrets?\.ya?ml$/i,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
];

function isSafeFile(p) {
  if (!p) return false;
  return SAFE_PATTERNS.some((re) => re.test(path.basename(p)));
}

function isPrivacySensitive(p) {
  if (!p) return false;
  let normalized = p.replace(/\\/g, '/');
  try {
    normalized = decodeURIComponent(normalized);
  } catch (_) {
    /* invalid encoding — use as-is */
  }
  if (isSafeFile(normalized)) return false;
  const basename = path.basename(normalized);
  return PRIVACY_PATTERNS.some((re) => re.test(basename) || re.test(normalized));
}

/**
 * Committable = git does NOT ignore the file (tracked or addable).
 * git check-ignore exit codes: 0 = ignored, 1 = NOT ignored, 128 = error/non-git.
 * Returns false (→ keep guarding) on no path / git error / non-git tree.
 */
function isCommittable(filePath) {
  if (!filePath) return false;
  try {
    const { execFileSync } = require('child_process');
    const abs = path.resolve(filePath);
    execFileSync('git', ['check-ignore', '-q', '--', abs], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
    return false; // exit 0 → ignored → not committable
  } catch (e) {
    return !!(e && e.status === 1); // exit 1 → not ignored → committable
  }
}

function targetPath(toolInput) {
  if (!toolInput) return '';
  return toolInput.file_path || toolInput.path || '';
}

function formatBlockMessage(filePath) {
  const basename = path.basename(filePath);
  const promptData = {
    type: 'PRIVACY_PROMPT',
    file: filePath,
    basename,
    question: {
      header: 'File Access',
      text: `I need to read "${basename}" which may contain sensitive data (API keys, passwords, tokens). Do you approve?`,
      options: [
        { label: 'Yes, approve access', description: `Allow reading ${basename} this time` },
        { label: 'No, skip this file', description: 'Continue without accessing this file' },
      ],
    },
  };
  return `
\x1b[36mNOTE:\x1b[0m This is not an error - this block protects sensitive data.

\x1b[33mPRIVACY BLOCK\x1b[0m: Gitignored sensitive file — requires user approval

  \x1b[33mFile:\x1b[0m ${filePath}

  This file is \x1b[1mgitignored\x1b[0m (a real local secret store) and may contain secrets.
  Committable files (tracked / addable) are auto-allowed — only gitignored ones are guarded.

\x1b[90m@@PRIVACY_PROMPT_START@@\x1b[0m
${JSON.stringify(promptData, null, 2)}
\x1b[90m@@PRIVACY_PROMPT_END@@\x1b[0m

  \x1b[34mClaude:\x1b[0m Use AskUserQuestion tool with the JSON above, then:
  \x1b[32mIf "Yes":\x1b[0m Use bash to read: cat "${filePath}"
  \x1b[31mIf "No":\x1b[0m  Continue without this file.
`;
}

(async () => {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;

    let data;
    try {
      data = JSON.parse(input);
    } catch (_) {
      process.exit(0); // invalid JSON → allow
    }

    const filePath = targetPath(data.tool_input);

    // Not a sensitive-named file → allow.
    if (!filePath || !isPrivacySensitive(filePath)) process.exit(0);

    // Committable (not gitignored) → allow freely.
    if (isCommittable(filePath)) {
      console.error(
        `\x1b[32m✓\x1b[0m Privacy: ${path.basename(filePath)} is committable (not gitignored) — auto-allowed`,
      );
      process.exit(0);
    }

    // Gitignored sensitive file → block until user approves (then read via bash cat).
    console.error(formatBlockMessage(filePath));
    process.exit(2);
  } catch (_) {
    process.exit(0); // fail-open
  }
})();
