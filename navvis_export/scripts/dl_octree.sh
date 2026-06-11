#!/bin/zsh
# Download one dataset's octree.bin with a fresh signed URL. Args: <prefix> <outfile>
set -e
BASE="https://immopass.iv.navvis.com"; SITE="3186889630268293"
PFX="$1"; OUT="$2"
TOK=$(curl -s -m 20 -X POST "$BASE/api/auth/generate_tokens" -H 'Content-Type: application/json' -H 'request-origin-type: IVION' -d '{"username":"Vision_FermeDuTemple","password":"immopass"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
python3 -c "import json;open('/tmp/poc/_b_$$.json','w').write(json.dumps({'prefix_in_site':'$PFX'}))"
SIGNED=$(curl -s -m 20 -H "x-authorization: Bearer $TOK" -H "request-origin-type: IVION" -H "Content-Type: application/json" -X POST -d @/tmp/poc/_b_$$.json "$BASE/api/site/$SITE/storage/download/prefix/signed/url" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")
QS="${SIGNED#*\?}"; HOST="https://eu.iv-cdn.navvis.com"
echo "downloading $OUT ..."
curl -s --max-time 1200 "$HOST/$SITE/$PFX/cloud/octree.bin?$QS" -o "$OUT" -w "done $OUT: [%{http_code}] %{size_download} bytes @ %{speed_download} B/s\n"
rm -f /tmp/poc/_b_$$.json
