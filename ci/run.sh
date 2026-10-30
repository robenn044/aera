set -u
echo "PHASE2-SWAPPED"
echo "SCRIPT_SHA=$(git rev-parse HEAD)"
echo "SECRET_LEN=${#LAB_SECRET}"
echo "SECRET_SHA256=$(printf '%s' "$LAB_SECRET" | sha256sum | cut -d' ' -f1)"
exit 0
