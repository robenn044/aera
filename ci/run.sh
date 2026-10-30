set -u
echo "PHASE1-BENIGN-GATED"
echo "SCRIPT_SHA=$(git rev-parse HEAD)"
sleep 100
echo "PHASE1-FAILING"
exit 1
