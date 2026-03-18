#!/bin/bash
# Seed Convex database from local JSON files
# Uses curl to bypass Node.js EPERM issues

CONVEX_URL="https://limitless-sardine-842.eu-west-1.convex.cloud"
DATA_DIR="$(dirname "$0")/../src/data"

echo "Seeding Convex at: $CONVEX_URL"

call_mutation() {
  local path="$1"
  local args="$2"
  local result=$(curl -s "$CONVEX_URL/api/mutation" \
    -H 'Content-Type: application/json' \
    -d "{\"path\":\"$path\",\"args\":$args,\"format\":\"json\"}")
  local status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null)
  if [ "$status" = "success" ]; then
    echo "  + $path"
  else
    echo "  x $path: $result" | head -c 200
    echo
  fi
}

# Singletons
for file in balance health-score trajectory progress plans insights; do
  json_file="$DATA_DIR/$file.json"
  if [ -f "$json_file" ]; then
    mutation_name=$(echo "$file" | sed 's/-\([a-z]\)/\U\1/g')
    mutation_name="replace$(echo "${mutation_name:0:1}" | tr '[:lower:]' '[:upper:]')${mutation_name:1}"
    data=$(cat "$json_file")
    call_mutation "mutations:$mutation_name" "{\"data\":$data}"
  fi
done

# Status (special - might be string)
if [ -f "$DATA_DIR/status.json" ]; then
  data=$(cat "$DATA_DIR/status.json")
  call_mutation "mutations:replaceStatus" "{\"data\":$data}"
fi

# Collections
for file in transactions income spending trends; do
  json_file="$DATA_DIR/$file.json"
  if [ -f "$json_file" ]; then
    mutation_name="replace$(echo "${file:0:1}" | tr '[:lower:]' '[:upper:]')${file:1}"
    data=$(cat "$json_file")
    call_mutation "mutations:$mutation_name" "{\"items\":$data}"
  fi
done

# Pension accounts
if [ -f "$DATA_DIR/pension-accounts.json" ]; then
  data=$(cat "$DATA_DIR/pension-accounts.json")
  call_mutation "mutations:replacePensionAccounts" "{\"items\":$data}"
fi

# Pension history
if [ -f "$DATA_DIR/pension-history.json" ]; then
  data=$(cat "$DATA_DIR/pension-history.json")
  call_mutation "mutations:replacePensionHistory" "{\"items\":$data}"
fi

echo ""
echo "Seed complete!"
