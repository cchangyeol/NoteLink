#!/usr/bin/env bash
# PR을 Codex로 리뷰하고, 결과를 내 계정의 PR 리뷰 코멘트로 남깁니다.
#
#   scripts/codex-review.sh <PR번호> [--dry-run]
#
# - 처음 실행: develop(또는 PR의 base)과 PR 사이의 전체 변경을 리뷰합니다.
# - 다시 실행: 내가 남긴 마지막 Codex 리뷰 이후의 새 커밋을 보고,
#   이전 지적이 고쳐졌는지 하나씩 확인합니다(재리뷰).
# - --dry-run: 코멘트를 올리지 않고 결과만 보여 줍니다.
#
# 필요한 것: git, gh(로그인), codex(로그인). 현재 작업 폴더는 건드리지 않고
# 임시 worktree에서 리뷰합니다.
set -euo pipefail

PR="${1:-}"
DRY_RUN=false
[ "${2:-}" = "--dry-run" ] && DRY_RUN=true
if ! [[ "$PR" =~ ^[0-9]+$ ]]; then
  echo "사용법: scripts/codex-review.sh <PR번호> [--dry-run]" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
ME=$(gh api user --jq .login)
MARKER="codex-review"

read -r STATE BASE HEAD_SHA < <(gh pr view "$PR" --json state,baseRefName,headRefOid \
  --jq '[.state, .baseRefName, .headRefOid] | @tsv')
TITLE=$(gh pr view "$PR" --json title --jq .title)
if [ "$STATE" != "OPEN" ]; then
  echo "PR #$PR 은(는) 열려 있지 않습니다 ($STATE)." >&2
  exit 1
fi

echo "▶ PR #$PR \"$TITLE\" ($BASE ← ${HEAD_SHA:0:7})"
git fetch -q origin "$BASE" "+refs/pull/$PR/head:refs/codex-review/pr-$PR"
BASE_SHA=$(git merge-base "origin/$BASE" "$HEAD_SHA")

# 내가 남긴 마지막 Codex 리뷰 찾기 (본문 끝의 <!-- codex-review sha=... round=... --> 표시)
PREV_ID=$(gh api --paginate "repos/$REPO/pulls/$PR/reviews" \
  --jq ".[] | select(.user.login == \"$ME\" and (.body | contains(\"<!-- $MARKER \"))) | .id" | tail -n 1)
PREV_BODY=""; PREV_SHA=""; ROUND=1
if [ -n "$PREV_ID" ]; then
  PREV_BODY=$(gh api "repos/$REPO/pulls/$PR/reviews/$PREV_ID" --jq .body)
  PREV_SHA=$(sed -n "s/.*<!-- $MARKER sha=\([0-9a-f]*\) round=\([0-9]*\) -->.*/\1/p" <<< "$PREV_BODY" | tail -n 1)
  PREV_ROUND=$(sed -n "s/.*<!-- $MARKER sha=[0-9a-f]* round=\([0-9]*\) -->.*/\1/p" <<< "$PREV_BODY" | tail -n 1)
  ROUND=$(( ${PREV_ROUND:-1} + 1 ))
fi

if [ -n "$PREV_SHA" ] && [ "$PREV_SHA" = "$HEAD_SHA" ]; then
  echo "마지막 Codex 리뷰(${PREV_SHA:0:7}) 이후 새 커밋이 없습니다."
  exit 0
fi

WORK=$(mktemp -d)
WT="$WORK/pr-$PR"
cleanup() {
  git worktree remove --force "$WT" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
git worktree add -q --detach "$WT" "$HEAD_SHA"

PROMPT="$WORK/prompt.md"
OUT="$WORK/out.md"
LOG="$WORK/codex.log"

{
  echo "GitHub PR #$PR \"$TITLE\" 를 리뷰한다. 현재 HEAD는 PR의 최신 커밋($HEAD_SHA)이다."
  echo "PR 전체 변경 범위: git diff $BASE_SHA...HEAD (base: $BASE)"
  if [ -n "$PREV_BODY" ]; then
    if [ -n "$PREV_SHA" ] && git merge-base --is-ancestor "$PREV_SHA" "$HEAD_SHA"; then
      echo "지난 리뷰 이후 새로 들어온 변경: git diff $PREV_SHA..HEAD"
    else
      echo "지난 리뷰 이후 히스토리가 바뀌었다(force push 등). PR 전체 변경을 다시 본다."
    fi
    echo
    echo "이번은 ${ROUND}차 재리뷰다. 아래 지난 리뷰의 지적을 하나씩 확인해서"
    echo "'해결됨 / 미해결 / 부분 해결'로 표시하고 근거(파일:줄)를 적어라."
    echo "그다음 새 변경에서 생긴 새 문제만 따로 적어라."
    echo
    echo "----- 지난 리뷰 -----"
    sed "/<!-- $MARKER /d" <<< "$PREV_BODY"
    echo "---------------------"
  fi
  echo
  echo "규칙:"
  echo "- 저장소의 README.md에 있는 개발 규칙(이름, API 형식, 버전 고정, 비밀값)을 기준으로 삼는다."
  echo "- 버그·보안·데이터 손실·규칙 위반 위주로 보고, 취향 차이는 적지 않는다."
  echo "- 결과는 한국어 마크다운. 지적마다 [P0~P3] 심각도, 파일:줄, 이유, 고치는 방법을 적는다."
  echo "- 문제가 없으면 '지적 사항 없음'이라고 적는다."
} > "$PROMPT"

echo "▶ Codex 리뷰 중... (${ROUND}차, 로그: $LOG)"
( cd "$WT" && codex review - < "$PROMPT" > "$OUT" 2> "$LOG" ) || {
  echo "codex review 실패. 로그 마지막 부분:" >&2
  tail -n 20 "$LOG" >&2
  exit 1
}

# 결과에 찍힌 임시 폴더 경로를 저장소 기준 경로로 바꾸기
strip_prefix() {
  awk -v p="$1" 'p != "" { while ((i = index($0, p)) > 0) $0 = substr($0, 1, i - 1) substr($0, i + length(p)) } { print }'
}
WIN_WT=$(cygpath -w "$WT" 2>/dev/null || true)
BODY_FILE="$WORK/body.md"
{
  if [ "$ROUND" -eq 1 ]; then
    echo "## 🤖 Codex 리뷰"
  else
    echo "## 🤖 Codex 재리뷰 (${ROUND}차)"
  fi
  echo
  echo "대상 커밋 \`${HEAD_SHA:0:7}\` · base \`$BASE\`$( [ -n "$PREV_SHA" ] && echo " · 지난 리뷰 \`${PREV_SHA:0:7}\`" )"
  echo
  strip_prefix "${WIN_WT:+$WIN_WT\\}" < "$OUT" | strip_prefix "$WT/"
  echo
  echo "<!-- $MARKER sha=$HEAD_SHA round=$ROUND -->"
} > "$BODY_FILE"

if $DRY_RUN; then
  echo "----- (dry-run) 올라갈 내용 -----"
  cat "$BODY_FILE"
  exit 0
fi

gh pr review "$PR" --comment --body-file "$BODY_FILE"
echo "✔ PR #$PR 에 리뷰 코멘트를 남겼습니다: $(gh pr view "$PR" --json url --jq .url)"
echo "  괜찮으면 승인: gh pr review $PR --approve"
