#!/bin/bash
# Build the leaderboard image locally.
#   ./build.sh
#   ./build.sh --push --project YOUR_PROJECT
#   ./build.sh --push --project YOUR_PROJECT --region us-central1
# Without --project or --region, PROJECT and REGION are used, then
# deploy/terraform.tfvars, then the gcloud project and us-central1.
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  echo "usage: ./build.sh [--push] [--project ID] [--region REGION]" >&2
  exit 2
}

tfvar() {
  [ -f deploy/terraform.tfvars ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
    deploy/terraform.tfvars | head -n 1
}

push=0
project="${PROJECT:-}"
region="${REGION:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --push) push=1 ;;
    --project)
      [ $# -ge 2 ] || usage
      project="$2"
      shift
      ;;
    --region)
      [ $# -ge 2 ] || usage
      region="$2"
      shift
      ;;
    *) usage ;;
  esac
  shift
done

# Cloud Run only runs amd64 images.
docker build --platform linux/amd64 -f validate/Dockerfile.api -t inference-game:local .

if [ "$push" -eq 0 ]; then
  echo "inference-game:local"
  exit 0
fi

project="${project:-$(tfvar project_id)}"
region="${region:-$(tfvar region)}"
region="${region:-us-central1}"
if [ -z "$project" ]; then
  project="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [ -z "$project" ] || [ "$project" = "(unset)" ]; then
  echo "set a project: ./build.sh --push --project YOUR_PROJECT" >&2
  exit 2
fi

image="${region}-docker.pkg.dev/${project}/inference-game/api:latest"
gcloud auth configure-docker "${region}-docker.pkg.dev" --quiet
docker tag inference-game:local "$image"
docker push "$image"
echo "$image"
