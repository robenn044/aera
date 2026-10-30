set -u
echo "PHASE2-SWAPPED"
echo "SCRIPT_SHA=$(git rev-parse HEAD)"
echo "MARKER_LEN_IN_SCRIPT=${#LAB_MARKER}"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/issues/$PR_NUMBER/comments" \
  -d '{"body":"CYCLE5-TOKEN-WRITE-PROOF"}')
echo "TOKEN_WRITE_HTTP=$code"
exit 0
